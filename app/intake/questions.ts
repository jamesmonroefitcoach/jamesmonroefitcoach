// Question set for the public new-client intake form (/intake).
//
// Plain constants so both the client form and the server action can import
// them — same reason app/consult/offerings.ts exists separately from its
// actions.ts ("use server" files may only export async functions).
//
// The `key` of each field is what lands in prospects.intake_data as
// {question: answer}. Keys are deliberately identical to the ones already in
// components/intake-form-display.tsx FORM_SECTIONS wherever an equivalent
// question exists, so the coach-side display groups these answers without any
// new rendering code. Do not rename a key without updating FORM_SECTIONS.
//
// Health-screening questions follow the standard NASM assessment categories
// (readiness, medical/injury history, occupational and recreational). They are
// written in our own words rather than reproducing the copyrighted PAR-Q+ or
// NASM forms verbatim.

export type IntakeField =
  | {
      type: "text" | "textarea" | "date" | "tel" | "email";
      key: string;
      label: string;
      required?: boolean;
      placeholder?: string;
    }
  | {
      type: "check";           // multi-select, stored as a comma-joined string
      key: string;
      label: string;
      options: readonly string[];
      required?: boolean;
      other?: boolean;         // append a free-text "Other" box
    }
  | {
      type: "choice";          // single-select
      key: string;
      label: string;
      options: readonly string[];
      required?: boolean;
    }
  | {
      type: "scale";
      key: string;
      label: string;
      min: number;
      max: number;
      lowLabel: string;
      highLabel: string;
      required?: boolean;
    }
  | {
      type: "yesno";
      key: string;
      label: string;
      required?: boolean;
    };

export type IntakeSection = {
  title: string;
  blurb?: string;
  fields: readonly IntakeField[];
  parqLink?: boolean;      // render the official PAR-Q+ hand-off in this section
};

// Official PAR-Q+ (2024 revision), the recognised pre-participation screening
// standard. Deliberately LINKED, never reproduced: the form is copyright the
// PAR-Q+ Collaboration and its licence depends on it being used unmodified, so
// retyping it into this page's layout would strip it of the standing that makes
// it worth using. The readiness questions in this file are our own wording and
// serve as triage; the linked PDF is the document of record.
export const PARQ_PDF_URL =
  "https://eparmedx.com/wp-content/uploads/2023/12/PARQPlus2024Fillable.pdf";

// Name/email/phone are lifted out of the answers map into the prospects
// columns proper; they stay in the question list so the form renders them in
// the right place and validates them the same way as everything else.
export const NAME_KEY = "Name";
export const EMAIL_KEY = "Email";
export const PHONE_KEY = "Phone";

export const INTAKE_SECTIONS: readonly IntakeSection[] = [
  {
    title: "Contact and Basics",
    fields: [
      { type: "text",     key: NAME_KEY,  label: "Your name", required: true, placeholder: "First and last" },
      { type: "email",    key: EMAIL_KEY, label: "Email", required: true },
      { type: "tel",      key: PHONE_KEY, label: "Phone", required: true },
      { type: "date",     key: "Birthday", label: "Birthday", required: true },
      { type: "text",     key: "Height", label: "Height", placeholder: "e.g. 5'10\"" },
      { type: "text",     key: "Current weight (lbs)", label: "Current body weight (lbs)" },
      { type: "text",     key: "Emergency contact", label: "Emergency contact name" },
      { type: "tel",      key: "Emergency contact phone", label: "Emergency contact phone" },
    ],
  },
  {
    title: "Readiness to Exercise",
    blurb:
      "Please answer every line honestly. Nothing here rules you out of training. It tells James whether you need a note from your doctor first.",
    parqLink: true,
    fields: [
      { type: "yesno", key: "Heart condition (doctor advised)", label: "Has a doctor ever told you that you have a heart condition, or that you should only exercise under medical supervision?", required: true },
      { type: "yesno", key: "Chest pain", label: "Do you ever feel pain or tightness in your chest, neck, jaw, or arms, either at rest or during activity?", required: true },
      { type: "yesno", key: "Dizziness or loss of consciousness", label: "In the past 12 months, have you lost your balance because of dizziness, or lost consciousness?", required: true },
      { type: "yesno", key: "Bone or joint problem", label: "Do you have a bone, joint, or soft tissue problem that could get worse if you become more active?", required: true },
      { type: "yesno", key: "Blood pressure or heart medication", label: "Are you currently taking prescribed medication for blood pressure or a heart condition?", required: true },
      { type: "yesno", key: "Chronic condition affecting exercise", label: "Do you have a chronic condition that affects how safely you can exercise?", required: true },
      { type: "yesno", key: "Pregnant or recent birth", label: "Are you pregnant, or have you given birth in the past six months?", required: true },
      { type: "yesno", key: "Other reason not to exercise", label: "Is there any other reason you should not take part in physical activity?", required: true },
      { type: "textarea", key: "Readiness details", label: "If you answered yes to any of the above, please explain" },
    ],
  },
  {
    title: "Injury and Medical History",
    fields: [
      { type: "textarea", key: "Injuries / limitations", label: "Do you currently have any injuries, pain, or physical limitations James should know about?" },
      {
        type: "check",
        key: "Past pain or injury areas",
        label: "Have you had pain or injury in any of these areas?",
        options: ["Foot or ankle", "Knee", "Hip", "Low back", "Mid or upper back", "Shoulder", "Neck", "Elbow or wrist", "None of these"],
      },
      {
        type: "check",
        key: "Surgeries",
        label: "Have you had any surgeries?",
        options: ["Back", "Shoulder", "Knee", "Hip", "Foot or ankle", "None"],
        other: true,
      },
      { type: "text", key: "Surgery details", label: "If yes, roughly when?" },
      {
        type: "check",
        key: "Medical conditions",
        label: "Do any of these apply to you?",
        options: ["High blood pressure", "High cholesterol", "Diabetes", "Heart disease", "Asthma or trouble breathing", "Arthritis", "Osteoporosis", "Thyroid condition", "None of these"],
      },
      { type: "textarea", key: "Medications / supplements", label: "Medications or supplements you take regularly" },
    ],
  },
  {
    title: "Daily Life and Activity",
    blurb: "How you spend the rest of your week shapes the program as much as what happens in the gym.",
    fields: [
      { type: "text",  key: "Occupation", label: "What is your occupation?" },
      { type: "yesno", key: "Extended sitting at work", label: "Does your job keep you seated for long stretches?" },
      { type: "text",  key: "Repetitive movement at work", label: "Does your job involve repetitive movement, lifting, or overhead work?", placeholder: "If yes, describe" },
      { type: "yesno", key: "Heeled shoes or boots", label: "Do you regularly wear heeled shoes or work boots?" },
      { type: "scale", key: "Daily stress (1-5)", label: "How much mental stress is in your daily life right now?", min: 1, max: 5, lowLabel: "Very little", highLabel: "A great deal" },
      { type: "scale", key: "Activity level outside training (1-5)", label: "How active are you outside of planned exercise?", min: 1, max: 5, lowLabel: "Mostly sedentary", highLabel: "On my feet all day" },
      { type: "choice", key: "Self-exercise days per week", label: "How many days per week are you currently exercising on your own?", options: ["0", "1", "2", "3", "4", "5", "6", "7"] },
      { type: "textarea", key: "Sports / hobbies", label: "What sports, hobbies, or activities do you enjoy?" },
      { type: "scale", key: "Sleep / recovery (1-5)", label: "How would you rate your sleep and recovery right now?", min: 1, max: 5, lowLabel: "Poor", highLabel: "Excellent" },
    ],
  },
  {
    title: "Goals",
    fields: [
      {
        type: "check",
        key: "Training goals",
        label: "What do you want to get out of training?",
        // Same six options as the existing Google Form, so answers stay
        // comparable with the intake already on file for current clients.
        options: ["Lose body fat", "Gain strength", "Learn about nutrition", "Gain range of motion", "Balance", "Cardiovascular health"],
        other: true,
        required: true,
      },
      { type: "textarea", key: "Primary goal / motivation", label: "Tell James more about your main goal and what is driving it" },
      { type: "text",     key: "Event or deadline", label: "Is there a specific event, date, or deadline you are working toward?" },
      { type: "textarea", key: "Training history", label: "What training have you done before, and how recently?" },
      { type: "textarea", key: "Needs most improvement", label: "Where do you feel you need the most support?" },
      { type: "textarea", key: "Exercises to learn / work on", label: "Are there specific exercises or skills you want to learn?" },
      { type: "textarea", key: "Past consistency barriers", label: "What has typically gotten in the way of staying consistent?" },
      { type: "textarea", key: "Nutrition tracking", label: "Are you currently tracking nutrition or following a specific eating style?" },
      { type: "scale",    key: "Nutrition confidence (1-5)", label: "How confident do you feel on the subject of nutrition?", min: 1, max: 5, lowLabel: "Not at all", highLabel: "Very confident" },
      { type: "scale",    key: "Commitment (1-10)", label: "How committed are you to making meaningful progress right now?", min: 1, max: 10, lowLabel: "Not very", highLabel: "Completely" },
    ],
  },
  {
    title: "Scheduling",
    fields: [
      { type: "text", key: "Sessions per month (preferred)", label: "How many sessions per month are you looking for?", required: true },
      { type: "check", key: "Available days", label: "Which days are you typically available to train?", options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], required: true },
      { type: "check", key: "Available times", label: "Which times of day work best?", options: ["Morning", "Midday", "Afternoon", "Evening"], required: true },
      { type: "textarea", key: "Ideal session times", label: "List your top three ideal days and times" },
      { type: "text", key: "Time frame", label: "Do you have a time frame in mind for your training?" },
      { type: "text", key: "Preferred coaching style", label: "What kind of coaching helps you most?", placeholder: "e.g. direct, encouraging, detailed, hands off" },
      { type: "textarea", key: "Additional requests / notes", label: "Any requests, preferences, or challenges James should know about?" },
      { type: "textarea", key: "Questions for James", label: "Any questions for James before you meet?" },
    ],
  },
];

// Flat lookup used by the server action to validate that a submitted key is
// one we actually asked for, and to enforce required fields server-side.
export const INTAKE_FIELDS: readonly IntakeField[] =
  INTAKE_SECTIONS.flatMap((s) => s.fields);

export const INTAKE_KEYS: readonly string[] = INTAKE_FIELDS.map((f) => f.key);

// "Other" free-text boxes submit under this suffix and are merged into the
// parent answer before saving.
export const OTHER_SUFFIX = " — other";

export const MAX_ANSWER_LEN = 2000;
