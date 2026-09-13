export type DomainDef = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
};

export const DOMAINS: DomainDef[] = [
  {
    slug: 'ai-ml',
    name: 'AI/ML',
    tagline: 'Teach a Machine to Think — Then Prove It Can.',
    description:
      'Build, train, and evaluate real machine learning models from data prep to model deployment, including classification and regression.',
  },
  {
    slug: 'llm-generative-ai',
    name: 'LLM & Generative AI',
    tagline: 'Build RAG Pipelines and Autonomous Agents.',
    description:
      'Prompt engineering, RAG architectures, vector databases, and LLM-powered agent workflows. (Requires completing an AI/ML track).',
  },
  {
    slug: 'data-science',
    name: 'Data Science',
    tagline: 'Turn Numbers Into Predictions.',
    description:
      'Work through a full data science lifecycle — cleaning, modelling, and validating predictions on a real-world style dataset.',
  },
  {
    slug: 'data-analysis',
    name: 'Data Analysis',
    tagline: 'Make the Data Talk.',
    description:
      'Turn raw spreadsheets and dashboards into decisions a business can act on, using the same tools analysts use on the job.',
  },
  {
    slug: 'iot',
    name: 'IoT',
    tagline: 'Give Everyday Things a Brain.',
    description:
      'Design and simulate a connected device pipeline — sensors, firmware logic, and a live data dashboard.',
  },
  {
    slug: 'fullstack-java',
    name: 'Full Stack Development (Java)',
    tagline: 'Build the Engine Behind the Screen.',
    description:
      'Ship a complete Java-backed web application, from data model to deployed API to working frontend.',
  },
  {
    slug: 'erp-odoo',
    name: 'ERP (Odoo)',
    tagline: 'The Skill Every Company Needs, That No One Else Is Teaching.',
    description:
      'Configure and customize a working Odoo ERP module for a real business process — inventory, sales, or accounting.',
  },
  {
    slug: 'data-engineering',
    name: 'Data Engineering',
    tagline: 'Build the Pipes Every Data Team Depends On.',
    description:
      'Design an ingestion-to-warehouse pipeline that a real analytics team could run on top of.',
  },
  {
    slug: 'fullstack-python',
    name: 'Full Stack Development (Python)',
    tagline: 'One Language. A Complete Application.',
    description:
      'Build a production-style application end to end in Python — backend, database, and a working frontend.',
  },
  {
    slug: 'robotics',
    name: 'Robotics',
    tagline: 'Build Machines That Move — Hardware or Simulation.',
    description:
      'Design, program, and demonstrate autonomous robotic systems from sensor integration to intelligent navigation.',
  },
];

export const DURATION_LEVELS = [
  { duration: 30, level: 'Foundation', certificate: 'Foundation Certificate' },
  { duration: 45, level: 'Foundation+', certificate: 'Foundation+ Certificate' },
  { duration: 60, level: 'Practitioner', certificate: 'Practitioner Certificate' },
  { duration: 75, level: 'Applied Practitioner', certificate: 'Applied Practitioner Certificate' },
  { duration: 90, level: 'Capstone', certificate: 'Capstone Certificate' },
] as const;

export const COMPANY_NAME = 'Yuktii AI Labs';
