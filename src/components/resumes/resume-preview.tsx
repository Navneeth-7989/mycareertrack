"use client";

import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { cn } from "cn";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Reads a resume without downloading it — click the name, the document appears.
 *
 * **An `<iframe>` pointed at our own route, not at a signed URL.** The route
 * answers 307 and the iframe follows it, so the credential never reaches our
 * JavaScript: there is nothing to hold, nothing to refresh when the 60-second
 * signature expires, and nothing to leak into a client bundle or a React DevTools
 * tree. It also means the browser's own PDF viewer does the rendering, so there
 * is no PDF library in the bundle — `pdf.js` would be ~350 KB to reimplement a
 * viewer every browser already ships.
 *
 * Two facts measured against the real bucket make this possible, both recorded in
 * `createResumeViewUrl`: a signed URL without the `download` option carries no
 * `Content-Disposition`, and object responses send no `X-Frame-Options` and no
 * CSP. If Supabase ever starts sending either, this dialog goes blank — which is
 * the main reason **"Open in new tab" is always present** rather than being a
 * power-user extra. It is also the answer on iOS Safari, which renders only the
 * first page of a framed PDF.
 *
 * **The iframe is mounted only while the dialog is open.** Rendering it eagerly
 * would mint a signed URL and pull a whole PDF for every row on the page, on page
 * load, for documents nobody asked to see.
 *
 * Offered for PDFs only. See `canPreviewKind` — no browser renders a DOCX, so the
 * caller gives those a download instead of a control that would appear to fail.
 */
export function ResumePreview({
  resume,
}: {
  resume: { id: string; label: string; fileName: string };
}) {
  const [open, setOpen] = useState(false);

  /**
   * Whether the document has painted.
   *
   * The iframe is transparent until it has, so the placeholder underneath shows
   * through instead of a flash of white box — a PDF over a slow connection would
   * otherwise look like a dialog that had opened empty and broken.
   */
  const [isLoaded, setIsLoaded] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      // Reset, so re-opening shows the placeholder again rather than a stale
      // "loaded" state over an iframe that is fetching from scratch.
      setIsLoaded(false);
    }

    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * The name itself is the trigger, which is what makes this discoverable
       * without adding a fifth icon button to a row that already has four. It
       * reads as a link on hover and is a real button underneath.
       */}
      <Button
        variant="link"
        className="h-auto justify-start p-0 text-sm leading-snug font-medium"
        render={<DialogTrigger />}
      >
        <span className="truncate">{resume.label}</span>
        <span className="sr-only"> — preview</span>
      </Button>

      {/*
       * Far wider and taller than the app's other dialogs, because the content is
       * an A4 page: at `max-w-lg` a resume is legible only by scrolling it
       * sideways, which is worse than the download it replaced. Capped in `vh` so
       * the footer stays on screen on a laptop.
       */}
      <DialogContent className="flex h-[88vh] max-h-[900px] w-full max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="truncate">{resume.label}</DialogTitle>

          {/*
           * `DialogDescription` is deliberately not used: the file name is not a
           * description of the dialog, and the real description of this surface is
           * the document inside it.
           */}
          <p className="text-muted-foreground truncate text-sm">{resume.fileName}</p>
        </DialogHeader>

        <div className="bg-muted/40 relative mt-5 min-h-0 flex-1 overflow-hidden rounded-lg border">
          {!isLoaded ? (
            <p
              className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm"
              // Decorative: the iframe below carries the real title, and a
              // screen reader announcing "Loading" over it is noise.
              aria-hidden="true"
            >
              Loading the document…
            </p>
          ) : null}

          {open ? (
            <iframe
              // Named, because an unlabelled frame is announced as "frame" and
              // several of these exist across the page's rows.
              title={`${resume.label} preview`}
              src={`/api/resumes/${resume.id}/view`}
              onLoad={() => setIsLoaded(true)}
              className={cn(
                "relative size-full transition-opacity duration-200",
                isLoaded ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null}
        </div>

        {/*
         * Not `DialogFooter`: these are not confirm/cancel actions, so the
         * reverse-stacking and right-alignment that footer applies would put
         * "Download" where a primary submit belongs.
         */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {/*
           * Plain anchors for the same reason as the row's download button:
           * these are API routes that redirect off-origin, so `next/link` would
           * treat them as pages and prefetch them — minting a signed URL on
           * hover.
           */}
          <a
            href={`/api/resumes/${resume.id}/download`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Download aria-hidden="true" data-icon="inline-start" />
            Download
          </a>

          {/*
           * Always here, never conditional. It is the fallback for every case
           * this iframe cannot serve — iOS Safari, a future framing header, a
           * reader who simply wants the whole window.
           */}
          <a
            href={`/api/resumes/${resume.id}/view`}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <ExternalLink aria-hidden="true" data-icon="inline-start" />
            Open in new tab
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
