import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { NewJobInput } from "@/lib/domain";
import { getPrisma } from "@/lib/server/db";
import { createHrJob } from "@/lib/server/recruitment/hr-jobs";
import type { HrContext } from "@/lib/server/session";

// Usage: tsx scripts/seed-demo-jobs.ts [--env-file .env.live.local]
// Adds the demo job postings to the journey-test organisation in ecopanel_test and names it
// "Nexora Labs". Jobs go through createHrJob, the same validation as the HR UI. Safe to run twice:
// a job whose title already exists in the org is skipped. Sends no email; touches nothing else.
const ORG_SLUG = "journey-test";
const ORG_NAME = "Nexora Labs";
const DATABASE = "ecopanel_test";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`${name} needs a value.`);
  return value;
}

const envFile = argValue("--env-file") ?? ".env.live.local";
if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
process.loadEnvFile(envFile);

type DemoJob = Omit<NewJobInput, "publicVisible">;

const JOBS: DemoJob[] = [
  {
    title: "Backend Engineer (Node.js)",
    department: "Engineering",
    location: "Bengaluru",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Build the Node.js services and APIs that power our hiring platform for thousands of recruiters.",
    description: "We're looking for a Backend Engineer to design and build the Node.js services behind our hiring platform. You'll own APIs end to end, from data modelling to production monitoring, and work closely with frontend, product and data teams. Our Bengaluru team works from the office three days a week.",
    responsibilities: [
      "Design, build and maintain REST APIs and background services in Node.js and TypeScript",
      "Model data in PostgreSQL and write efficient, well-indexed queries",
      "Add tests, logging and metrics so services are reliable in production",
      "Take part in code reviews, design discussions and the on-call rotation",
      "Work with product managers to break features into deliverable milestones"
    ],
    qualifications: [
      "3+ years of backend development experience with Node.js",
      "Strong TypeScript or JavaScript and a good grasp of async programming",
      "Hands-on experience with PostgreSQL or another relational database",
      "Familiarity with queues, caching and REST API design",
      "Experience with Docker and a cloud platform such as AWS or GCP is a plus"
    ],
    salaryRange: "14-22 LPA",
    status: "Published"
  },
  {
    title: "Product Manager",
    department: "Product",
    location: "Mumbai",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Own the roadmap for our recruiter experience, from discovery to launch and adoption.",
    description: "We're hiring a Product Manager to own the recruiter experience on our platform. You'll talk to customers every week, turn their problems into clear priorities, and work with engineering and design to ship improvements that measurably save recruiters time. You'll be based in our Mumbai office with flexible remote days.",
    responsibilities: [
      "Own the roadmap for recruiter-facing features and keep it aligned with company goals",
      "Run customer interviews and analyse usage data to find the most valuable problems",
      "Write clear product requirements and acceptance criteria with engineering and design",
      "Define success metrics for each launch and track adoption after release",
      "Coordinate launches with sales, customer success and marketing"
    ],
    qualifications: [
      "4+ years of product management experience, ideally in B2B SaaS",
      "A track record of shipping products that customers actively use",
      "Comfort with data: SQL, dashboards and A/B test results",
      "Excellent written and verbal communication in English",
      "An engineering or design background is a plus"
    ],
    salaryRange: "24-34 LPA",
    status: "Published"
  },
  {
    title: "UI/UX Designer",
    department: "Design",
    location: "Pune",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Design simple, accessible workflows for recruiters and candidates across web and mobile.",
    description: "We're looking for a UI/UX Designer to shape how recruiters and candidates use our product. You'll take features from research and wireframes to polished, accessible interfaces, and help grow our design system. You'll work from our Pune studio and collaborate closely with product and engineering.",
    responsibilities: [
      "Design end-to-end flows, wireframes and high-fidelity UI in Figma",
      "Plan and run usability tests with recruiters and candidates",
      "Contribute components and guidelines to our design system",
      "Work with engineers during build to make sure designs ship as intended",
      "Make accessibility a default in every design"
    ],
    qualifications: [
      "2-4 years of experience designing web or mobile products",
      "A portfolio showing your process, not only final screens",
      "Strong Figma skills, including components and auto layout",
      "Working knowledge of accessibility guidelines (WCAG)",
      "Experience with B2B or workflow-heavy products is a plus"
    ],
    salaryRange: "10-16 LPA",
    status: "Published"
  },
  {
    title: "Data Analyst",
    department: "Data & Analytics",
    location: "India",
    workplace: "Remote",
    employmentType: "Full-time",
    shortDescription: "Turn hiring and product data into insights that guide decisions across the company.",
    description: "We're hiring a Data Analyst to help teams across the company make better decisions with data. You'll build reliable dashboards, answer product and business questions, and work with engineering to improve how we collect and model data. This is a fully remote role open to candidates anywhere in India.",
    responsibilities: [
      "Build and maintain dashboards for product, sales and customer success teams",
      "Write SQL to answer ad-hoc questions and share findings clearly",
      "Define and document core metrics so every team uses the same numbers",
      "Analyse funnels, cohorts and experiments to find opportunities",
      "Work with engineering to improve event tracking and data quality"
    ],
    qualifications: [
      "2+ years of experience in a data or business analyst role",
      "Strong SQL skills and experience with a BI tool such as Metabase, Looker or Power BI",
      "Working knowledge of Python or R for analysis",
      "Ability to explain findings to non-technical colleagues",
      "Experience with product analytics in a SaaS company is a plus"
    ],
    salaryRange: "8-13 LPA",
    status: "Published"
  },
  {
    title: "QA Automation Engineer",
    department: "Engineering",
    location: "Mumbai",
    workplace: "On-site",
    employmentType: "Full-time",
    shortDescription: "Build the automated test suites that let us release with confidence every week.",
    description: "We're looking for a QA Automation Engineer to own test automation across our web platform and APIs. You'll build and maintain our end-to-end and API test suites, plug them into CI, and work with developers to catch issues before they reach customers. This role is based full-time in our Mumbai office.",
    responsibilities: [
      "Design and maintain automated end-to-end tests with Playwright or Cypress",
      "Write API tests and integrate all suites into the CI pipeline",
      "Review requirements early and help define clear acceptance criteria",
      "Investigate failures, report bugs clearly and verify fixes",
      "Track test coverage and flaky tests, and drive improvements"
    ],
    qualifications: [
      "3+ years of experience in QA, with at least 2 years in test automation",
      "Hands-on experience with Playwright, Cypress or Selenium",
      "Good programming skills in JavaScript, TypeScript or Java",
      "Experience testing REST APIs with Postman or code-based tools",
      "Familiarity with CI tools such as GitHub Actions or Jenkins"
    ],
    salaryRange: "9-14 LPA",
    status: "Published"
  },
  {
    title: "Software Engineering Intern",
    department: "Engineering",
    location: "Mumbai",
    workplace: "Hybrid",
    employmentType: "Internship",
    shortDescription: "A six-month internship shipping real features with mentorship from senior engineers.",
    description: "Our six-month Software Engineering Internship is for students and recent graduates who want to ship real features, not toy projects. You'll join a product team, pair with a dedicated mentor, and take a feature from design to production. Strong interns receive a pre-placement offer.",
    responsibilities: [
      "Build and ship features in our web app and APIs with guidance from a mentor",
      "Write tests and documentation for the code you deliver",
      "Take part in code reviews, stand-ups and sprint planning",
      "Investigate and fix bugs reported by customers",
      "Present your work to the team at the end of the internship"
    ],
    qualifications: [
      "Final-year student or 2025/2026 graduate in Computer Science or a related field",
      "Good fundamentals in data structures, algorithms and programming",
      "Comfort with at least one language, such as JavaScript, Python or Java",
      "Projects, internships or open-source work you can talk about",
      "Available full-time for six months, starting January"
    ],
    salaryRange: "40,000 per month (stipend)",
    status: "Published"
  },
  {
    title: "DevOps Engineer",
    department: "Engineering",
    location: "Hyderabad",
    workplace: "On-site",
    employmentType: "Full-time",
    shortDescription: "Own the cloud infrastructure, CI/CD and observability that keep our platform fast and reliable.",
    description: "We're hiring a DevOps Engineer to own the infrastructure behind our platform. You'll automate our cloud setup with infrastructure as code, improve our CI/CD pipelines, and make sure we can see and fix problems quickly. This role is based in our Hyderabad office.",
    responsibilities: [
      "Manage AWS infrastructure with Terraform and keep environments consistent",
      "Build and improve CI/CD pipelines for fast, safe releases",
      "Run containerised workloads with Docker and Kubernetes",
      "Set up monitoring, alerting and logging, and take part in on-call",
      "Improve security, backups and cost efficiency across environments"
    ],
    qualifications: [
      "3+ years of experience in DevOps, SRE or platform engineering",
      "Hands-on experience with AWS, Terraform and Kubernetes",
      "Scripting skills in Bash or Python",
      "Experience with Prometheus, Grafana or a similar observability stack",
      "A solid understanding of networking and Linux fundamentals"
    ],
    salaryRange: "16-24 LPA",
    status: "Draft"
  }
];

async function main() {
  // Safety: only the local disposable ecopanel_test database.
  execFileSync(process.execPath, ["scripts/assert-safe-db.mjs", "DATABASE_URL"], { stdio: "inherit" });
  const database = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, ""));
  if (database !== DATABASE) throw new Error(`DATABASE_URL must target ${DATABASE}.`);

  const prisma = getPrisma();
  const organization = await prisma.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true, name: true, slug: true } });
  if (!organization) throw new Error(`Organisation "${ORG_SLUG}" not found.`);

  if (organization.name !== ORG_NAME) {
    await prisma.organization.update({ where: { id: organization.id }, data: { name: ORG_NAME } });
    console.log(`Renamed organisation "${organization.name}" to "${ORG_NAME}".`);
    organization.name = ORG_NAME;
  } else {
    console.log(`Organisation already named "${ORG_NAME}".`);
  }

  // createHrJob only reads context.organization; the rest identifies this script.
  const context: HrContext = {
    user: { id: "seed-demo-jobs", name: "Demo job seed", email: "" },
    organization,
    role: "OWNER",
    sessionId: "seed-demo-jobs"
  };

  const existing = await prisma.job.findMany({ where: { organizationId: organization.id }, select: { title: true } });
  const titles = new Set(existing.map(job => job.title.trim().toLowerCase()));
  for (const job of JOBS) {
    if (titles.has(job.title.toLowerCase())) {
      console.log(`Skipped (exists): ${job.title}`);
      continue;
    }
    const created = await createHrJob(context, { ...job, publicVisible: job.status === "Published" });
    titles.add(job.title.toLowerCase());
    console.log(`Created: ${created.title} (${created.status})`);
  }

  const counts = await prisma.job.groupBy({ by: ["status"], where: { organizationId: organization.id }, _count: { _all: true } });
  const total = counts.reduce((sum, item) => sum + item._count._all, 0);
  console.log(`${ORG_NAME} (${ORG_SLUG}) now has ${total} jobs: ${counts.map(item => `${item._count._all} ${item.status}`).join(", ")}.`);
  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
