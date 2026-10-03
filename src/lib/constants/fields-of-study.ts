/**
 * Specialisations offered alongside the degree in the onboarding wizard.
 *
 * This field exists because `DEGREES` is a closed list: it turns "B.Tech
 * Computer Science" into "B.Tech", and the half that recruiters actually care
 * about needs somewhere to live.
 *
 * Open, like universities and unlike degrees. Specialisations are invented
 * faster than any list can track them — a branch named after whatever was
 * fashionable the year the programme launched is normal — so the combobox keeps
 * a free-text escape hatch and the server only bounds the length.
 *
 * Optional, too: it is meaningless for an MBBS or an LL.B, so the wizard never
 * requires it (DESIGN.md §9 fixes the required set, and this is not in it).
 *
 * Grouped below for maintenance, exported de-duplicated and alphabetical.
 */

const COMPUTING = [
  "Computer Science",
  "Computer Science and Engineering",
  "Computer Engineering",
  "Information Technology",
  "Information Systems",
  "Software Engineering",
  "Computer Applications",
  "Artificial Intelligence",
  "Artificial Intelligence and Machine Learning",
  "Machine Learning",
  "Data Science",
  "Data Science and Engineering",
  "Data Analytics",
  "Cyber Security",
  "Cloud Computing",
  "Internet of Things",
  "Blockchain Technology",
  "Human-Computer Interaction",
  "Computer Science and Business Systems",
];

const ELECTRONICS_AND_ELECTRICAL = [
  "Electronics and Communication Engineering",
  "Electronics and Telecommunication Engineering",
  "Electronics Engineering",
  "Electrical Engineering",
  "Electrical and Electronics Engineering",
  "Instrumentation and Control Engineering",
  "VLSI Design",
  "Embedded Systems",
  "Power Engineering",
  "Robotics and Automation",
  "Mechatronics",
];

const CORE_ENGINEERING = [
  "Mechanical Engineering",
  "Civil Engineering",
  "Structural Engineering",
  "Chemical Engineering",
  "Aerospace Engineering",
  "Aeronautical Engineering",
  "Automobile Engineering",
  "Industrial Engineering",
  "Production Engineering",
  "Manufacturing Engineering",
  "Metallurgical Engineering",
  "Materials Science and Engineering",
  "Mining Engineering",
  "Marine Engineering",
  "Petroleum Engineering",
  "Environmental Engineering",
  "Agricultural Engineering",
  "Biomedical Engineering",
  "Biotechnology",
  "Bioinformatics",
  "Food Technology",
  "Textile Engineering",
  "Transportation Engineering",
  "Energy Engineering",
];

const SCIENCES = [
  "Physics",
  "Applied Physics",
  "Chemistry",
  "Applied Chemistry",
  "Mathematics",
  "Applied Mathematics",
  "Statistics",
  "Biology",
  "Biological Sciences",
  "Biochemistry",
  "Botany",
  "Zoology",
  "Microbiology",
  "Genetics",
  "Environmental Science",
  "Geology",
  "Geography",
  "Astronomy and Astrophysics",
  "Life Sciences",
];

const HEALTH_AND_MEDICINE = [
  "Medicine and Surgery",
  "Dentistry",
  "Pharmacy",
  "Pharmacology",
  "Nursing",
  "Public Health",
  "Physiotherapy",
  "Nutrition and Dietetics",
  "Medical Laboratory Technology",
  "Veterinary Science",
  "Ayurveda",
  "Homoeopathy",
  "Psychology",
  "Clinical Psychology",
];

const AGRICULTURE = ["Agriculture", "Horticulture", "Forestry", "Agribusiness Management"];

const BUSINESS_AND_COMMERCE = [
  "Business Administration",
  "Business Analytics",
  "Accounting",
  "Accounting and Finance",
  "Finance",
  "Banking and Insurance",
  "Marketing",
  "Digital Marketing",
  "Human Resource Management",
  "Operations Management",
  "Supply Chain Management",
  "International Business",
  "Entrepreneurship",
  "Economics",
  "Business Economics",
  "Commerce",
  "Actuarial Science",
  "Hotel Management",
  "Hospitality Management",
  "Tourism Management",
  "Retail Management",
];

const HUMANITIES_AND_SOCIAL_SCIENCES = [
  "English Literature",
  "History",
  "Political Science",
  "Sociology",
  "Philosophy",
  "Anthropology",
  "Linguistics",
  "International Relations",
  "Development Studies",
  "Public Administration",
  "Social Work",
  "Education",
  "Library and Information Science",
  "Physical Education",
  "Journalism and Mass Communication",
  "Media Studies",
];

const LAW = ["Law", "Corporate Law", "Criminal Law", "Intellectual Property Law", "Cyber Law"];

const DESIGN_AND_ARCHITECTURE = [
  "Architecture",
  "Urban and Regional Planning",
  "Interior Design",
  "Graphic Design",
  "Product Design",
  "Communication Design",
  "Fashion Design",
  "Animation and Multimedia",
  "Game Design",
  "Fine Arts",
  "Performing Arts",
  "Music",
];

export const FIELDS_OF_STUDY: readonly string[] = [
  ...new Set([
    ...COMPUTING,
    ...ELECTRONICS_AND_ELECTRICAL,
    ...CORE_ENGINEERING,
    ...SCIENCES,
    ...HEALTH_AND_MEDICINE,
    ...AGRICULTURE,
    ...BUSINESS_AND_COMMERCE,
    ...HUMANITIES_AND_SOCIAL_SCIENCES,
    ...LAW,
    ...DESIGN_AND_ARCHITECTURE,
  ]),
].sort((left, right) => left.localeCompare(right, "en"));
