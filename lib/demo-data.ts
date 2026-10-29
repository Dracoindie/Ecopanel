import type {
  Application,
  Candidate,
  DemoAssessment,
  DemoStore,
  EmailMessage,
  EmailTemplate,
  Interview,
  Job,
  MailSettings
} from "@/lib/domain";

const iso = (date: string) => `${date}T09:00:00.000Z`;

export const DEMO_TODAY = "2026-10-25";
export const DEMO_COMPANY = "Nexora Labs";

export const seedJobs: Job[] = [
  {
    id: "job-be-staff",
    title: "Staff Backend Engineer",
    department: "Engineering",
    location: "London",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Own the core services behind Nexora's real-time data infrastructure.",
    description:
      "We are looking for a Staff Backend Engineer to shape the systems that move and protect millions of real-time events every day. You will work across service boundaries, partner with product and infrastructure teams, and set the technical direction for reliability, observability, and developer velocity.",
    responsibilities: [
      "Lead the design and delivery of resilient, low-latency backend services.",
      "Set pragmatic architecture standards across the platform engineering group.",
      "Partner with product teams to turn ambiguous requirements into safe delivery plans.",
      "Improve incident response, observability, and operational ownership.",
      "Mentor senior engineers and raise the quality bar through review and design critique."
    ],
    qualifications: [
      "7+ years building production backend systems at meaningful scale.",
      "Deep experience with distributed systems, queues, caching, and relational data stores.",
      "A track record of leading cross-team technical projects.",
      "Clear written communication and a bias toward measurable outcomes.",
      "Experience with TypeScript, Go, or a similar backend language."
    ],
    salaryRange: "£115,000 – £145,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-09-28"),
    createdAt: iso("2026-09-25")
  },
  {
    id: "job-ai-applied",
    title: "Applied AI Engineer",
    department: "AI & Research",
    location: "Remote",
    workplace: "Remote",
    employmentType: "Full-time",
    shortDescription: "Turn frontier models into dependable product experiences.",
    description:
      "Our Applied AI team ships the agent systems that make Nexora products feel immediate and trustworthy. You will evaluate models, build orchestration layers, and work directly with product teams to move from prototype to production without losing sight of safety or latency.",
    responsibilities: [
      "Build and evaluate agentic workflows for real customer use cases.",
      "Design retrieval, tool-use, and guardrail systems with measurable quality targets.",
      "Create offline and online evaluation pipelines for model behaviour.",
      "Collaborate with product and design on interaction patterns for AI features.",
      "Document failure modes and contribute to responsible AI reviews."
    ],
    qualifications: [
      "Strong software engineering fundamentals in Python or TypeScript.",
      "Hands-on experience shipping LLM or ML-powered products.",
      "Comfort designing evals, datasets, and quality metrics.",
      "Ability to communicate trade-offs to non-specialist partners.",
      "Curiosity about reliability, safety, and human-in-the-loop systems."
    ],
    salaryRange: "$150,000 – $190,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-10-02"),
    createdAt: iso("2026-09-30")
  },
  {
    id: "job-product-designer",
    title: "Senior Product Designer, AI Workspaces",
    department: "Design",
    location: "San Francisco",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Design calm, high-agency tools for complex AI workflows.",
    description:
      "We are hiring a Senior Product Designer to define how people collaborate with intelligent systems. This is a hands-on product design role spanning discovery, interaction design, prototyping, and design systems for our AI workspace products.",
    responsibilities: [
      "Lead end-to-end design for a major AI workspace surface.",
      "Turn complex technical constraints into clear, testable interaction models.",
      "Prototype with real data and run high-signal customer research.",
      "Partner with engineering to protect craft through implementation.",
      "Contribute reusable patterns to the Nexora design system."
    ],
    qualifications: [
      "5+ years designing complex B2B or developer-facing products.",
      "A portfolio showing systems thinking, interaction detail, and shipped outcomes.",
      "Ability to communicate decisions with clarity and evidence.",
      "Experience with AI-native or data-heavy interfaces is a plus.",
      "Comfort working in a fast-moving, highly collaborative environment."
    ],
    salaryRange: "$145,000 – $175,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-10-05"),
    createdAt: iso("2026-10-01")
  },
  {
    id: "job-frontend",
    title: "Frontend Engineer, Design Systems",
    department: "Engineering",
    location: "Remote",
    workplace: "Remote",
    employmentType: "Full-time",
    shortDescription: "Build the accessible component foundation used across Nexora.",
    description:
      "Join the Design Systems team to build the component library and frontend foundations that power Nexora's customer and internal products. You will care deeply about accessibility, performance, and the developer experience of the people using your work.",
    responsibilities: [
      "Build accessible, composable React and TypeScript components.",
      "Evolve tokens, themes, and interaction patterns across product surfaces.",
      "Partner with designers on interface quality and documentation.",
      "Improve bundle performance and frontend testing standards.",
      "Support product teams through migration and adoption."
    ],
    qualifications: [
      "4+ years building production frontend applications.",
      "Advanced React and TypeScript skills.",
      "Strong understanding of WCAG and inclusive interaction design.",
      "Experience maintaining a component library or design system.",
      "Clear communication and a collaborative working style."
    ],
    salaryRange: "$125,000 – $155,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-10-08"),
    createdAt: iso("2026-10-06")
  },
  {
    id: "job-tpm",
    title: "Technical Product Manager, Enterprise Platform",
    department: "Product",
    location: "New York",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Shape the platform capabilities our largest customers rely on.",
    description:
      "We are looking for a Technical Product Manager to own the enterprise platform roadmap. You will work closely with engineering, security, sales, and customer success to make Nexora the most dependable choice for mission-critical teams.",
    responsibilities: [
      "Own the enterprise platform roadmap from discovery to launch.",
      "Translate customer and compliance needs into clear product requirements.",
      "Partner with engineering on sequencing, trade-offs, and technical risk.",
      "Define success metrics and communicate outcomes across the company.",
      "Build strong relationships with design partners and strategic customers."
    ],
    qualifications: [
      "5+ years of product management experience in technical B2B products.",
      "Comfort discussing APIs, data models, security, and reliability.",
      "A track record of shipping platform capabilities at scale.",
      "Excellent written and verbal communication.",
      "Experience with enterprise procurement or regulated industries is a plus."
    ],
    salaryRange: "$155,000 – $185,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-10-10"),
    createdAt: iso("2026-10-08")
  },
  {
    id: "job-data",
    title: "Data Platform Engineer",
    department: "Engineering",
    location: "Berlin",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Make reliable, well-governed data the default at Nexora.",
    description:
      "Our Data Platform team builds the pipelines, contracts, and tooling that let teams trust their data. You will own ingestion and transformation foundations while improving how the company observes quality and cost.",
    responsibilities: [
      "Design and operate reliable batch and streaming data pipelines.",
      "Define data contracts and ownership across product domains.",
      "Improve lineage, observability, and cost visibility.",
      "Partner with analytics and ML teams on platform needs.",
      "Automate quality checks and safe schema evolution."
    ],
    qualifications: [
      "4+ years in data or platform engineering.",
      "Strong SQL and production Python experience.",
      "Experience with a modern warehouse and orchestration tooling.",
      "Understanding of data modelling and governance practices.",
      "A pragmatic, service-minded approach to platform work."
    ],
    salaryRange: "€95,000 – €125,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-10-12"),
    createdAt: iso("2026-10-11")
  },
  {
    id: "job-people",
    title: "People Operations Lead",
    department: "People",
    location: "London",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Build thoughtful systems for how Nexora grows and supports its people.",
    description:
      "We are looking for a People Operations Lead to own the operational backbone of the employee experience. You will design scalable processes, improve the quality of people data, and help managers build high-trust teams.",
    responsibilities: [
      "Own people operations processes across the employee lifecycle.",
      "Partner with leadership on workforce planning and org health.",
      "Improve onboarding, performance, and internal mobility programmes.",
      "Maintain accurate, appropriately protected people records.",
      "Coach managers through sensitive people situations."
    ],
    qualifications: [
      "5+ years in people operations or a related HR role.",
      "Experience designing scalable people processes in a growing company.",
      "Sound judgement and discretion with confidential information.",
      "Strong communication and stakeholder management.",
      "Familiarity with UK employment practices is preferred."
    ],
    salaryRange: "£80,000 – £100,000",
    status: "Published",
    publicVisible: true,
    publishedAt: iso("2026-10-15"),
    createdAt: iso("2026-10-14")
  },
  {
    id: "job-solutions",
    title: "Solutions Architect",
    department: "Customer Success",
    location: "New York",
    workplace: "Hybrid",
    employmentType: "Full-time",
    shortDescription: "Help strategic customers design dependable Nexora deployments.",
    description:
      "As a Solutions Architect, you will partner with customers and our engineering teams to design integrations that are secure, observable, and built to last. This role blends technical discovery, architecture, and hands-on problem solving.",
    responsibilities: [
      "Lead technical discovery with strategic customers.",
      "Design integration and deployment architectures.",
      "Partner with product and engineering on customer-driven improvements.",
      "Create reference patterns and implementation guidance.",
      "Support complex launches and escalations."
    ],
    qualifications: [
      "5+ years in solutions engineering, architecture, or consulting.",
      "Strong understanding of APIs, identity, and cloud infrastructure.",
      "Excellent presentation and stakeholder skills.",
      "Ability to debug across application and network layers.",
      "Willingness to travel occasionally for customer workshops."
    ],
    salaryRange: "$140,000 – $170,000",
    status: "Draft",
    publicVisible: false,
    publishedAt: null,
    createdAt: iso("2026-10-20")
  },
  {
    id: "job-qa",
    title: "Software Engineer in Test",
    department: "Engineering",
    location: "Remote",
    workplace: "Remote",
    employmentType: "Contract",
    shortDescription: "Strengthen confidence in the systems behind every release.",
    description:
      "This contract role will help us raise the quality bar across critical product surfaces. You will build test strategies, improve automation, and work closely with product engineers to make fast, safe releases routine.",
    responsibilities: [
      "Design risk-based test strategies for high-value journeys.",
      "Build and maintain reliable end-to-end automation.",
      "Partner with engineers on testability and release confidence.",
      "Investigate defects and improve feedback loops.",
      "Document quality standards and support adoption."
    ],
    qualifications: [
      "3+ years in software testing or test automation.",
      "Strong TypeScript or Python skills.",
      "Experience with browser automation and CI pipelines.",
      "A pragmatic approach to balancing coverage and speed.",
      "Clear communication across engineering teams."
    ],
    salaryRange: "$75 – $95 per hour",
    status: "Closed",
    publicVisible: false,
    publishedAt: iso("2026-09-10"),
    createdAt: iso("2026-09-08")
  }
];

export const seedCandidates: Candidate[] = [
  {
    id: "cand-renesha",
    name: "Renesha Sagar",
    email: "renesha.sagar@example.com",
    phone: "+44 7700 900112",
    location: "London, UK",
    headline: "Staff backend engineer focused on distributed systems",
    linkedinUrl: "https://www.linkedin.com/in/example-renesha",
    githubUrl: "https://github.com/example-renesha",
    portfolioUrl: "https://renesha.example.com"
  },
  {
    id: "cand-alex",
    name: "Alex Sharma",
    email: "alex.sharma@example.com",
    phone: "+44 7700 900123",
    location: "Manchester, UK",
    headline: "Backend engineer building reliable payment infrastructure",
    linkedinUrl: "https://www.linkedin.com/in/example-alex",
    githubUrl: "https://github.com/example-alex",
    portfolioUrl: ""
  },
  {
    id: "cand-priya",
    name: "Priya Nair",
    email: "priya.nair@example.com",
    phone: "+1 415 555 0142",
    location: "San Francisco, US",
    headline: "Applied AI engineer and former research engineer",
    linkedinUrl: "https://www.linkedin.com/in/example-priya",
    githubUrl: "https://github.com/example-priya",
    portfolioUrl: "https://priya.example.com"
  },
  {
    id: "cand-marcus",
    name: "Marcus Chen",
    email: "marcus.chen@example.com",
    phone: "+1 646 555 0188",
    location: "Brooklyn, US",
    headline: "Product designer for complex data tools",
    linkedinUrl: "https://www.linkedin.com/in/example-marcus",
    githubUrl: "",
    portfolioUrl: "https://marcus.example.com"
  },
  {
    id: "cand-sofia",
    name: "Sofia Alvarez",
    email: "sofia.alvarez@example.com",
    phone: "+34 600 555 018",
    location: "Madrid, Spain",
    headline: "Frontend engineer with a design systems practice",
    linkedinUrl: "https://www.linkedin.com/in/example-sofia",
    githubUrl: "https://github.com/example-sofia",
    portfolioUrl: ""
  },
  {
    id: "cand-daniel",
    name: "Daniel Okafor",
    email: "daniel.okafor@example.com",
    phone: "+44 7700 900155",
    location: "Bristol, UK",
    headline: "Platform engineer working on high-volume event systems",
    linkedinUrl: "https://www.linkedin.com/in/example-daniel",
    githubUrl: "https://github.com/example-daniel",
    portfolioUrl: ""
  },
  {
    id: "cand-amara",
    name: "Amara Osei",
    email: "amara.osei@example.com",
    phone: "+1 917 555 0134",
    location: "New York, US",
    headline: "Technical product leader for enterprise platforms",
    linkedinUrl: "https://www.linkedin.com/in/example-amara",
    githubUrl: "",
    portfolioUrl: "https://amara.example.com"
  },
  {
    id: "cand-liam",
    name: "Liam Bennett",
    email: "liam.bennett@example.com",
    phone: "+44 7700 900178",
    location: "Edinburgh, UK",
    headline: "ML engineer building evaluation-first agent products",
    linkedinUrl: "https://www.linkedin.com/in/example-liam",
    githubUrl: "https://github.com/example-liam",
    portfolioUrl: ""
  },
  {
    id: "cand-maya",
    name: "Maya Patel",
    email: "maya.patel@example.com",
    phone: "+1 310 555 0160",
    location: "Los Angeles, US",
    headline: "Senior product designer and researcher",
    linkedinUrl: "https://www.linkedin.com/in/example-maya",
    githubUrl: "",
    portfolioUrl: "https://maya.example.com"
  },
  {
    id: "cand-noah",
    name: "Noah Williams",
    email: "noah.williams@example.com",
    phone: "+49 30 555 0191",
    location: "Berlin, Germany",
    headline: "Data platform engineer with a governance focus",
    linkedinUrl: "https://www.linkedin.com/in/example-noah",
    githubUrl: "https://github.com/example-noah",
    portfolioUrl: ""
  },
  {
    id: "cand-elena",
    name: "Elena Petrova",
    email: "elena.petrova@example.com",
    phone: "+44 7700 900199",
    location: "Cambridge, UK",
    headline: "Infrastructure engineer and open-source contributor",
    linkedinUrl: "https://www.linkedin.com/in/example-elena",
    githubUrl: "https://github.com/example-elena",
    portfolioUrl: ""
  },
  {
    id: "cand-jonah",
    name: "Jonah Kim",
    email: "jonah.kim@example.com",
    phone: "+1 206 555 0127",
    location: "Seattle, US",
    headline: "Frontend systems engineer focused on accessibility",
    linkedinUrl: "https://www.linkedin.com/in/example-jonah",
    githubUrl: "https://github.com/example-jonah",
    portfolioUrl: "https://jonah.example.com"
  }
];

const cv = (fileName: string, size: number, uploadedAt: string) => ({
  fileName,
  size,
  mimeType: "application/pdf",
  uploadedAt,
  storageStatus: "Not uploaded — demo only" as const
});

export const seedApplications: Application[] = [
  {
    id: "app-001",
    candidateId: "cand-renesha",
    jobId: "job-be-staff",
    appliedAt: iso("2026-10-06"),
    stage: "Selected",
    source: "Careers site",
    coverLetter:
      "Nexora's focus on dependable real-time infrastructure is exactly the kind of problem I want to spend the next chapter of my career on. I have led platform reliability programmes across payments and messaging systems, and I enjoy building the technical and human systems that let teams move quickly without losing confidence.",
    cv: cv("Renesha-Sagar-CV.pdf", 284_672, iso("2026-10-06")),
    notes: [
      {
        id: "note-001",
        author: "Maya Chen",
        body: "Strong systems depth and very clear ownership narrative. Panel recommended progressing to offer.",
        createdAt: iso("2026-10-22")
      }
    ],
    history: [
      { id: "evt-001", type: "application", label: "Application received", detail: "Applied to Staff Backend Engineer", createdAt: iso("2026-10-06"), actor: "Candidate" },
      { id: "evt-002", type: "status", label: "Moved to In Review", detail: "Initial screening started", createdAt: iso("2026-10-08"), actor: "Maya Chen" },
      { id: "evt-003", type: "status", label: "Moved to Shortlisted", detail: "Profile matched the role brief", createdAt: iso("2026-10-10"), actor: "Maya Chen" },
      { id: "evt-004", type: "interview", label: "Interview scheduled", detail: "Adaptive voice panel · 21 Oct 2026", createdAt: iso("2026-10-13"), actor: "Maya Chen" },
      { id: "evt-005", type: "assessment", label: "Demo assessment available", detail: "Panel evaluation added to the candidate dossier", createdAt: iso("2026-10-21"), actor: "Demo evaluator" },
      { id: "evt-006", type: "status", label: "Moved to Selected", detail: "Offer recommendation recorded", createdAt: iso("2026-10-22"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-002",
    candidateId: "cand-alex",
    jobId: "job-be-staff",
    appliedAt: iso("2026-10-09"),
    stage: "Shortlisted",
    source: "Referral",
    coverLetter:
      "I have spent the last five years building payment APIs where correctness and latency both matter. I would love to bring that experience to Nexora and work on infrastructure that other teams can build on with confidence.",
    cv: cv("Alex-Sharma-Resume.pdf", 198_240, iso("2026-10-09")),
    notes: [
      {
        id: "note-002",
        author: "Maya Chen",
        body: "Good technical signal. Confirm scope of incident ownership during the panel.",
        createdAt: iso("2026-10-18")
      }
    ],
    history: [
      { id: "evt-007", type: "application", label: "Application received", detail: "Applied to Staff Backend Engineer", createdAt: iso("2026-10-09"), actor: "Candidate" },
      { id: "evt-008", type: "status", label: "Moved to In Review", detail: "Screening started", createdAt: iso("2026-10-11"), actor: "Maya Chen" },
      { id: "evt-009", type: "status", label: "Moved to Shortlisted", detail: "Technical screen complete", createdAt: iso("2026-10-18"), actor: "Maya Chen" },
      { id: "evt-010", type: "email", label: "Shortlist email sent (demo)", detail: "Interview invitation prepared in demo mode", createdAt: iso("2026-10-19"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-003",
    candidateId: "cand-priya",
    jobId: "job-ai-applied",
    appliedAt: iso("2026-10-11"),
    stage: "Interview",
    source: "Careers site",
    coverLetter:
      "I enjoy the messy middle between model research and a product people can trust. At my last company I built evaluation infrastructure for a support agent and helped design the escalation paths that made it safe to deploy.",
    cv: cv("Priya-Nair-CV.pdf", 341_908, iso("2026-10-11")),
    notes: [],
    history: [
      { id: "evt-011", type: "application", label: "Application received", detail: "Applied to Applied AI Engineer", createdAt: iso("2026-10-11"), actor: "Candidate" },
      { id: "evt-012", type: "status", label: "Moved to Shortlisted", detail: "Portfolio review complete", createdAt: iso("2026-10-17"), actor: "Maya Chen" },
      { id: "evt-013", type: "interview", label: "Interview scheduled", detail: "Adaptive voice panel · 28 Oct 2026", createdAt: iso("2026-10-20"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-004",
    candidateId: "cand-marcus",
    jobId: "job-product-designer",
    appliedAt: iso("2026-10-12"),
    stage: "In Review",
    source: "Careers site",
    coverLetter:
      "I am drawn to products that make complex work feel calm. My portfolio includes data-heavy tools and AI-assisted workflows, with a focus on interaction models that keep people in control.",
    cv: cv("Marcus-Chen-Portfolio-and-CV.pdf", 1_842_112, iso("2026-10-12")),
    notes: [],
    history: [
      { id: "evt-014", type: "application", label: "Application received", detail: "Applied to Senior Product Designer", createdAt: iso("2026-10-12"), actor: "Candidate" },
      { id: "evt-015", type: "status", label: "Moved to In Review", detail: "Portfolio review in progress", createdAt: iso("2026-10-14"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-005",
    candidateId: "cand-sofia",
    jobId: "job-frontend",
    appliedAt: iso("2026-10-23"),
    stage: "New",
    source: "Careers site",
    coverLetter:
      "I care about the invisible details that make a frontend feel solid: keyboard behaviour, component contracts, and the documentation that helps a team move together. I would love to bring that craft to Nexora.",
    cv: cv("Sofia-Alvarez-CV.pdf", 226_304, iso("2026-10-23")),
    notes: [],
    history: [
      { id: "evt-016", type: "application", label: "Application received", detail: "Applied to Frontend Engineer", createdAt: iso("2026-10-23"), actor: "Candidate" }
    ]
  },
  {
    id: "app-006",
    candidateId: "cand-daniel",
    jobId: "job-be-staff",
    appliedAt: iso("2026-10-13"),
    stage: "Interview",
    source: "Careers site",
    coverLetter:
      "I have built event-driven systems that process hundreds of thousands of messages per minute. I enjoy the operational side of the work just as much as the design, especially making failure modes understandable and recoverable.",
    cv: cv("Daniel-Okafor-CV.pdf", 259_840, iso("2026-10-13")),
    notes: [
      {
        id: "note-003",
        author: "Maya Chen",
        body: "Strong operational depth. Ask about mentoring and cross-team influence in the panel.",
        createdAt: iso("2026-10-20")
      }
    ],
    history: [
      { id: "evt-017", type: "application", label: "Application received", detail: "Applied to Staff Backend Engineer", createdAt: iso("2026-10-13"), actor: "Candidate" },
      { id: "evt-018", type: "status", label: "Moved to Shortlisted", detail: "Screening complete", createdAt: iso("2026-10-17"), actor: "Maya Chen" },
      { id: "evt-019", type: "interview", label: "Interview completed", detail: "Demo panel session reviewed", createdAt: iso("2026-10-22"), actor: "Demo evaluator" }
    ]
  },
  {
    id: "app-007",
    candidateId: "cand-amara",
    jobId: "job-tpm",
    appliedAt: iso("2026-10-14"),
    stage: "Shortlisted",
    source: "Referral",
    coverLetter:
      "I have worked at the intersection of enterprise customer needs and platform engineering for most of my career. The opportunity to shape Nexora's enterprise platform feels like a very strong fit.",
    cv: cv("Amara-Osei-CV.pdf", 318_464, iso("2026-10-14")),
    notes: [],
    history: [
      { id: "evt-020", type: "application", label: "Application received", detail: "Applied to Technical Product Manager", createdAt: iso("2026-10-14"), actor: "Candidate" },
      { id: "evt-021", type: "status", label: "Moved to Shortlisted", detail: "Referral screen complete", createdAt: iso("2026-10-19"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-008",
    candidateId: "cand-liam",
    jobId: "job-ai-applied",
    appliedAt: iso("2026-10-24"),
    stage: "New",
    source: "Careers site",
    coverLetter:
      "I have spent the last three years building evaluation tooling for agent products. I am especially interested in the relationship between offline eval quality and what customers actually experience.",
    cv: cv("Liam-Bennett-CV.pdf", 174_080, iso("2026-10-24")),
    notes: [],
    history: [
      { id: "evt-022", type: "application", label: "Application received", detail: "Applied to Applied AI Engineer", createdAt: iso("2026-10-24"), actor: "Candidate" }
    ]
  },
  {
    id: "app-009",
    candidateId: "cand-maya",
    jobId: "job-product-designer",
    appliedAt: iso("2026-10-04"),
    stage: "Rejected",
    source: "Careers site",
    coverLetter:
      "I have designed research and workflow products for technical teams for over six years. I would be excited to bring that experience to a team working on the next generation of intelligent software.",
    cv: cv("Maya-Patel-CV.pdf", 436_224, iso("2026-10-04")),
    notes: [
      {
        id: "note-004",
        author: "Maya Chen",
        body: "Strong portfolio, but the current role needs more recent AI workspace depth.",
        createdAt: iso("2026-10-16")
      }
    ],
    history: [
      { id: "evt-023", type: "application", label: "Application received", detail: "Applied to Senior Product Designer", createdAt: iso("2026-10-04"), actor: "Candidate" },
      { id: "evt-024", type: "status", label: "Moved to In Review", detail: "Portfolio review started", createdAt: iso("2026-10-07"), actor: "Maya Chen" },
      { id: "evt-025", type: "status", label: "Moved to Rejected", detail: "Decision recorded after portfolio review", createdAt: iso("2026-10-16"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-010",
    candidateId: "cand-noah",
    jobId: "job-data",
    appliedAt: iso("2026-10-20"),
    stage: "In Review",
    source: "Careers site",
    coverLetter:
      "I like making data infrastructure easier to trust. My recent work has focused on contract testing, lineage, and reducing the operational burden of large transformation graphs.",
    cv: cv("Noah-Williams-CV.pdf", 292_352, iso("2026-10-20")),
    notes: [],
    history: [
      { id: "evt-026", type: "application", label: "Application received", detail: "Applied to Data Platform Engineer", createdAt: iso("2026-10-20"), actor: "Candidate" },
      { id: "evt-027", type: "status", label: "Moved to In Review", detail: "CV and profile review", createdAt: iso("2026-10-22"), actor: "Maya Chen" }
    ]
  },
  {
    id: "app-011",
    candidateId: "cand-elena",
    jobId: "job-be-staff",
    appliedAt: iso("2026-10-22"),
    stage: "New",
    source: "Careers site",
    coverLetter:
      "I have spent my career close to the infrastructure layer, from storage systems to service mesh migrations. I value clear technical writing and the kind of operational ownership that makes complex systems calmer over time.",
    cv: cv("Elena-Petrova-CV.pdf", 204_800, iso("2026-10-22")),
    notes: [],
    history: [
      { id: "evt-028", type: "application", label: "Application received", detail: "Applied to Staff Backend Engineer", createdAt: iso("2026-10-22"), actor: "Candidate" }
    ]
  },
  {
    id: "app-012",
    candidateId: "cand-jonah",
    jobId: "job-frontend",
    appliedAt: iso("2026-10-15"),
    stage: "Interview",
    source: "Referral",
    coverLetter:
      "I enjoy building the shared foundation that helps product teams move faster without sacrificing accessibility. I have led design-system adoption across multiple frontend teams and care deeply about documentation.",
    cv: cv("Jonah-Kim-CV.pdf", 231_424, iso("2026-10-15")),
    notes: [],
    history: [
      { id: "evt-029", type: "application", label: "Application received", detail: "Applied to Frontend Engineer", createdAt: iso("2026-10-15"), actor: "Candidate" },
      { id: "evt-030", type: "status", label: "Moved to Shortlisted", detail: "Referral screen complete", createdAt: iso("2026-10-19"), actor: "Maya Chen" },
      { id: "evt-031", type: "interview", label: "Interview completed", detail: "Demo panel session reviewed", createdAt: iso("2026-10-23"), actor: "Demo evaluator" }
    ]
  }
];

export const seedAssessments: DemoAssessment[] = [
  {
    id: "as-001",
    applicationId: "app-001",
    interviewId: "int-001",
    status: "Available",
    generatedAt: iso("2026-10-21"),
    isDemo: true,
    overallScore: 9.1,
    recommendation: "Strong Hire",
    summary:
      "Renesha demonstrated exceptional systems judgement, clear ownership, and strong commercial awareness. Her evidence was specific and consistently tied to measurable outcomes.",
    dimensions: {
      technical: {
        score: 9.4,
        evidence: [
          "Explained a graceful degradation strategy for a payment event pipeline with clear trade-offs.",
          "Connected caching choices to observed latency and correctness constraints."
        ],
        sourceTurns: ["turn-4", "turn-7", "turn-12"],
        confidence: 0.94
      },
      product: {
        score: 8.7,
        evidence: [
          "Tied reliability work to merchant trust and support burden.",
          "Described how she prioritised work using customer impact data."
        ],
        sourceTurns: ["turn-9", "turn-14"],
        confidence: 0.9
      },
      communication: {
        score: 9.2,
        evidence: ["Structured answers with explicit context, decisions, and outcomes."],
        sourceTurns: ["turn-4", "turn-16"],
        confidence: 0.92
      },
      problemSolving: {
        score: 9,
        evidence: [
          "Adapted quickly when asked to reason about a new failure mode.",
          "Separated immediate mitigation from longer-term architectural fixes."
        ],
        sourceTurns: ["turn-12", "turn-18"],
        confidence: 0.91
      },
      adaptability: {
        score: 8.9,
        evidence: ["Reflected thoughtfully on a decision she would approach differently today."],
        sourceTurns: ["turn-20"],
        confidence: 0.88
      }
    },
    strengths: ["Systems architecture", "Operational ownership", "Executive-level clarity"],
    risks: ["May prefer deep platform work over broad product experimentation"],
    contradictions: [],
    unresolvedConcerns: [],
    isAiAssisted: true
  },
  {
    id: "as-002",
    applicationId: "app-006",
    interviewId: "int-004",
    status: "Available",
    generatedAt: iso("2026-10-22"),
    isDemo: true,
    overallScore: 8.4,
    recommendation: "Hire",
    summary:
      "Daniel showed strong production engineering depth and calm incident reasoning. Product framing was solid but less consistently quantified than the strongest candidates.",
    dimensions: {
      technical: {
        score: 8.8,
        evidence: ["Described queue backpressure and replay strategies with concrete safeguards."],
        sourceTurns: ["turn-3", "turn-8"],
        confidence: 0.9
      },
      product: {
        score: 7.8,
        evidence: ["Connected reliability improvements to customer trust but used fewer outcome metrics."],
        sourceTurns: ["turn-10"],
        confidence: 0.82
      },
      communication: {
        score: 8.6,
        evidence: ["Clear explanations and good use of concrete examples."],
        sourceTurns: ["turn-3", "turn-14"],
        confidence: 0.89
      },
      problemSolving: {
        score: 8.5,
        evidence: ["Broke a complex failure into detectable, recoverable stages."],
        sourceTurns: ["turn-8", "turn-12"],
        confidence: 0.87
      },
      adaptability: {
        score: 8.1,
        evidence: ["Reasonable response to a shift in constraints; could have explored more alternatives."],
        sourceTurns: ["turn-16"],
        confidence: 0.8
      }
    },
    strengths: ["Incident response", "Event-driven architecture", "Mentoring"],
    risks: ["Could strengthen customer-impact framing"],
    contradictions: [],
    unresolvedConcerns: ["Confirm scope of cross-team technical leadership"],
    isAiAssisted: true
  },
  {
    id: "as-003",
    applicationId: "app-012",
    interviewId: "int-005",
    status: "Available",
    generatedAt: iso("2026-10-23"),
    isDemo: true,
    overallScore: 8.2,
    recommendation: "Leaning Hire",
    summary:
      "Jonah has excellent accessibility craft and system-level frontend thinking. Evidence around ambiguous product trade-offs was lighter.",
    dimensions: {
      technical: {
        score: 8.6,
        evidence: ["Explained component API constraints and migration strategy in detail."],
        sourceTurns: ["turn-2", "turn-7"],
        confidence: 0.9
      },
      product: {
        score: 7.5,
        evidence: ["Recognised adoption friction but leaned on design partners rather than explicit metrics."],
        sourceTurns: ["turn-9"],
        confidence: 0.78
      },
      communication: {
        score: 8.4,
        evidence: ["Thoughtful, concise examples with clear reasoning."],
        sourceTurns: ["turn-2", "turn-11"],
        confidence: 0.86
      },
      problemSolving: {
        score: 8.3,
        evidence: ["Mapped accessibility defects to root causes and prevention."],
        sourceTurns: ["turn-7", "turn-13"],
        confidence: 0.85
      },
      adaptability: {
        score: 7.9,
        evidence: ["Open to challenge; took a moment to reframe the scenario."],
        sourceTurns: ["turn-15"],
        confidence: 0.79
      }
    },
    strengths: ["Accessibility", "Design systems", "Technical documentation"],
    risks: ["Limited evidence on navigating conflicting product priorities"],
    contradictions: [],
    unresolvedConcerns: ["Probe product trade-off examples in the next round"],
    isAiAssisted: true
  }
];

export const seedInterviews: Interview[] = [
  {
    id: "int-001",
    applicationId: "app-001",
    candidateId: "cand-renesha",
    jobId: "job-be-staff",
    scheduledAt: "2026-10-21T14:00:00.000Z",
    durationMinutes: 30,
    timezone: "Europe/London",
    round: "Adaptive voice panel",
    status: "Completed",
    assessmentId: "as-001",
    notes: "Panel completed. Demo report available."
  },
  {
    id: "int-002",
    applicationId: "app-002",
    candidateId: "cand-alex",
    jobId: "job-be-staff",
    scheduledAt: "2026-10-27T10:00:00.000Z",
    durationMinutes: 30,
    timezone: "Europe/London",
    round: "Adaptive voice panel",
    status: "Scheduled",
    notes: "Focus on incident ownership and stakeholder communication."
  },
  {
    id: "int-003",
    applicationId: "app-003",
    candidateId: "cand-priya",
    jobId: "job-ai-applied",
    scheduledAt: "2026-10-28T14:30:00.000Z",
    durationMinutes: 30,
    timezone: "America/Los_Angeles",
    round: "Applied AI panel",
    status: "Scheduled",
    notes: "Explore evaluation strategy and production guardrails."
  },
  {
    id: "int-004",
    applicationId: "app-006",
    candidateId: "cand-daniel",
    jobId: "job-be-staff",
    scheduledAt: "2026-10-22T11:00:00.000Z",
    durationMinutes: 30,
    timezone: "Europe/London",
    round: "Adaptive voice panel",
    status: "Completed",
    assessmentId: "as-002",
    notes: "Completed. Awaiting final decision."
  },
  {
    id: "int-005",
    applicationId: "app-012",
    candidateId: "cand-jonah",
    jobId: "job-frontend",
    scheduledAt: "2026-10-23T16:00:00.000Z",
    durationMinutes: 30,
    timezone: "America/Los_Angeles",
    round: "Frontend systems panel",
    status: "Completed",
    assessmentId: "as-003",
    notes: "Completed. Demo report available."
  },
  {
    id: "int-006",
    applicationId: "app-007",
    candidateId: "cand-amara",
    jobId: "job-tpm",
    scheduledAt: "2026-10-29T09:30:00.000Z",
    durationMinutes: 30,
    timezone: "America/New_York",
    round: "Enterprise product panel",
    status: "Scheduled",
    notes: "Explore platform strategy and customer discovery."
  },
  {
    id: "int-007",
    applicationId: "app-003",
    candidateId: "cand-priya",
    jobId: "job-ai-applied",
    scheduledAt: "2026-11-03T17:00:00.000Z",
    durationMinutes: 30,
    timezone: "America/Los_Angeles",
    round: "Technical follow-up",
    status: "Scheduled",
    notes: "Follow-up on agent evaluation evidence."
  }
];

export const seedTemplates: EmailTemplate[] = [
  {
    id: "tpl-app-received",
    name: "Application received",
    category: "Application",
    description: "Acknowledge a new application and set expectations.",
    subject: "We received your application for {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nThank you for applying for the {{job_title}} role at {{company_name}}. We have received your application and our hiring team will review it shortly.\n\nIf your experience matches what we are looking for, we will be in touch about next steps. You can reply to this message if you need to share anything else.\n\nBest,\n{{sender_name}}\n{{company_name}} Talent Team",
    updatedAt: iso("2026-10-01")
  },
  {
    id: "tpl-status-update",
    name: "Application status update",
    category: "Application",
    description: "Share a clear update while an application is in review.",
    subject: "An update on your {{job_title}} application",
    body:
      "Hi {{candidate_first_name}},\n\nI wanted to share a quick update on your application for {{job_title}} at {{company_name}}. Your profile is still being reviewed by the hiring team, and we will contact you as soon as there is a clear next step.\n\nThank you for your patience and continued interest.\n\nBest,\n{{sender_name}}",
    updatedAt: iso("2026-10-02")
  },
  {
    id: "tpl-shortlisted",
    name: "Shortlisting confirmation",
    category: "Shortlist",
    description: "Confirm a candidate has progressed to the next stage.",
    subject: "You have been shortlisted for {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nGood news — you have been shortlisted for the {{job_title}} role at {{company_name}}. We enjoyed learning about your experience and would like to continue the conversation.\n\nOur team will follow up with the details of the next step. Please let us know if you have any questions in the meantime.\n\nBest,\n{{sender_name}}\n{{company_name}} Talent Team",
    updatedAt: iso("2026-10-03")
  },
  {
    id: "tpl-interview-invite",
    name: "Interview invitation",
    category: "Interview",
    description: "Invite a candidate to a scheduled interview.",
    subject: "Interview invitation: {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nWe would like to invite you to interview for the {{job_title}} role at {{company_name}}.\n\nInterview date: {{interview_date}}\nInterview time: {{interview_time}}\n\nThis will be an adaptive voice interview. You will receive the room details and joining guidance separately. If the time does not work, reply to this message and we will help.\n\nBest,\n{{sender_name}}",
    updatedAt: iso("2026-10-04")
  },
  {
    id: "tpl-interview-reschedule",
    name: "Interview rescheduling",
    category: "Interview",
    description: "Propose a new interview time.",
    subject: "Updated interview time for {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nWe need to move your interview for {{job_title}}. We are sorry for the change and would like to propose a new time.\n\nNew interview date: {{interview_date}}\nNew interview time: {{interview_time}}\n\nPlease reply to confirm whether this works for you. We will make sure you have everything you need before the conversation.\n\nBest,\n{{sender_name}}",
    updatedAt: iso("2026-10-05")
  },
  {
    id: "tpl-interview-cancel",
    name: "Interview cancellation",
    category: "Interview",
    description: "Cancel an interview with a clear next step.",
    subject: "Interview update for {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nWe are writing to let you know that your interview for {{job_title}} on {{interview_date}} has been cancelled. We are sorry for any inconvenience this causes.\n\nOur team will follow up with you about the next step. If you have questions, please reply to this message.\n\nBest,\n{{sender_name}}",
    updatedAt: iso("2026-10-06")
  },
  {
    id: "tpl-interview-reminder",
    name: "Interview reminder",
    category: "Interview",
    description: "Remind a candidate about an upcoming interview.",
    subject: "Reminder: your {{job_title}} interview",
    body:
      "Hi {{candidate_first_name}},\n\nThis is a friendly reminder that your interview for {{job_title}} is coming up on {{interview_date}} at {{interview_time}}.\n\nPlease make sure you have a quiet space and a working microphone. If anything has changed, reply to this message and our team will help.\n\nBest,\n{{sender_name}}",
    updatedAt: iso("2026-10-07")
  },
  {
    id: "tpl-rejection",
    name: "Rejection notification",
    category: "Outcome",
    description: "A respectful outcome message with useful context.",
    subject: "An update on your application for {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nThank you for taking the time to apply for {{job_title}} at {{company_name}}. After careful review, we have decided not to move forward with your application at this time.\n\nThis was a competitive process, and our decision is not a reflection of your broader potential. We appreciate the care you put into your application and hope you will consider us again in the future.\n\nWarmly,\n{{sender_name}}\n{{company_name}} Talent Team",
    updatedAt: iso("2026-10-08")
  },
  {
    id: "tpl-interview-completed",
    name: "Interview completed",
    category: "Interview",
    description: "Confirm that a candidate's interview was received.",
    subject: "We received your interview: {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nThank you for completing your interview for the {{job_title}} role at {{company_name}}. We have received it, and the hiring team will review your answers and be in touch about next steps.\n\nBest,\n{{sender_name}}",
    updatedAt: iso("2026-10-29")
  },
  {
    id: "tpl-offer",
    name: "Selection / offer notification",
    category: "Outcome",
    description: "Congratulate a selected candidate and outline next steps.",
    subject: "You have been selected for {{job_title}}",
    body:
      "Hi {{candidate_first_name}},\n\nWe are delighted to let you know that you have been selected for the {{job_title}} role at {{company_name}}.\n\nThe hiring team was impressed by your experience and the clarity of your interview. We will follow up separately with the offer details and next steps.\n\nCongratulations, and welcome to the next stage.\n\nBest,\n{{sender_name}}\n{{company_name}} Talent Team",
    updatedAt: iso("2026-10-09")
  }
];

const mail = (
  id: string,
  candidateId: string,
  applicationId: string,
  jobId: string,
  templateId: string | null,
  recipientName: string,
  recipientEmail: string,
  subject: string,
  preview: string,
  status: EmailMessage["status"],
  createdAt: string
): EmailMessage => ({
  id,
  candidateId,
  applicationId,
  jobId,
  templateId,
  recipientName,
  recipientEmail,
  subject,
  body: preview,
  preview,
  status,
  createdAt,
  isDemo: true,
  attachments: []
});

export const seedEmails: EmailMessage[] = [
  mail("email-001", "cand-renesha", "app-001", "job-be-staff", "tpl-offer", "Renesha Sagar", "renesha.sagar@example.com", "You have been selected for Staff Backend Engineer", "We are delighted to let you know that you have been selected for the Staff Backend Engineer role at Nexora Labs.", "Sent", iso("2026-10-22")),
  mail("email-002", "cand-alex", "app-002", "job-be-staff", "tpl-shortlisted", "Alex Sharma", "alex.sharma@example.com", "You have been shortlisted for Staff Backend Engineer", "Good news — you have been shortlisted for the Staff Backend Engineer role at Nexora Labs.", "Sent", iso("2026-10-19")),
  mail("email-003", "cand-priya", "app-003", "job-ai-applied", "tpl-interview-invite", "Priya Nair", "priya.nair@example.com", "Interview invitation: Applied AI Engineer", "We would like to invite you to interview for the Applied AI Engineer role at Nexora Labs.", "Sent", iso("2026-10-20")),
  mail("email-004", "cand-daniel", "app-006", "job-be-staff", "tpl-interview-reminder", "Daniel Okafor", "daniel.okafor@example.com", "Reminder: your Staff Backend Engineer interview", "This is a friendly reminder that your interview for Staff Backend Engineer is coming up.", "Pending", iso("2026-10-24")),
  mail("email-005", "cand-maya", "app-009", "job-product-designer", "tpl-rejection", "Maya Patel", "maya.patel@example.com", "An update on your application for Senior Product Designer", "Thank you for taking the time to apply for Senior Product Designer at Nexora Labs.", "Failed", iso("2026-10-16")),
  mail("email-006", "cand-amara", "app-007", "job-tpm", "tpl-shortlisted", "Amara Osei", "amara.osei@example.com", "You have been shortlisted for Technical Product Manager", "Good news — you have been shortlisted for the Technical Product Manager role at Nexora Labs.", "Draft", iso("2026-10-23")),
  mail("email-007", "cand-jonah", "app-012", "job-frontend", "tpl-interview-invite", "Jonah Kim", "jonah.kim@example.com", "Interview invitation: Frontend Engineer, Design Systems", "We would like to invite you to interview for the Frontend Engineer role at Nexora Labs.", "Sent", iso("2026-10-20")),
  mail("email-008", "cand-marcus", "app-004", "job-product-designer", "tpl-app-received", "Marcus Chen", "marcus.chen@example.com", "We received your application for Senior Product Designer", "Thank you for applying for the Senior Product Designer role at Nexora Labs.", "Sent", iso("2026-10-12")),
  mail("email-009", "cand-noah", "app-010", "job-data", "tpl-status-update", "Noah Williams", "noah.williams@example.com", "An update on your Data Platform Engineer application", "I wanted to share a quick update on your application for Data Platform Engineer at Nexora Labs.", "Failed", iso("2026-10-23")),
  mail("email-010", "cand-sofia", "app-005", "job-frontend", "tpl-app-received", "Sofia Alvarez", "sofia.alvarez@example.com", "We received your application for Frontend Engineer", "Thank you for applying for the Frontend Engineer, Design Systems role at Nexora Labs.", "Draft", iso("2026-10-24")),
  mail("email-011", "cand-renesha", "app-001", "job-be-staff", "tpl-interview-invite", "Renesha Sagar", "renesha.sagar@example.com", "Interview invitation: Staff Backend Engineer", "We would like to invite you to interview for the Staff Backend Engineer role at Nexora Labs.", "Sent", iso("2026-10-13")),
  mail("email-012", "cand-priya", "app-003", "job-ai-applied", null, "Priya Nair", "priya.nair@example.com", "A note from the hiring team", "Thank you for the thoughtful conversation about evaluation strategy today.", "Pending", iso("2026-10-24"))
];

export const seedMailSettings: MailSettings = {
  senderName: "Maya Chen",
  senderAddress: "talent@nexoralabs.example",
  replyTo: "talent@nexoralabs.example",
  provider: "Not connected",
  deliveryStatus: "Demo mode",
  signature: "Maya Chen\nTalent Operations · Nexora Labs"
};

export const createDemoStore = (): DemoStore => ({
  jobs: seedJobs.map(item => ({ ...item })),
  candidates: seedCandidates.map(item => ({ ...item })),
  applications: seedApplications.map(item => ({
    ...item,
    cv: { ...item.cv },
    notes: item.notes.map(note => ({ ...note })),
    history: item.history.map(event => ({ ...event }))
  })),
  interviews: seedInterviews.map(item => ({ ...item })),
  assessments: seedAssessments.map(item => ({
    ...item,
    dimensions: {
      technical: { ...item.dimensions.technical, evidence: [...item.dimensions.technical.evidence], sourceTurns: [...item.dimensions.technical.sourceTurns] },
      product: { ...item.dimensions.product, evidence: [...item.dimensions.product.evidence], sourceTurns: [...item.dimensions.product.sourceTurns] },
      communication: { ...item.dimensions.communication, evidence: [...item.dimensions.communication.evidence], sourceTurns: [...item.dimensions.communication.sourceTurns] },
      problemSolving: { ...item.dimensions.problemSolving, evidence: [...item.dimensions.problemSolving.evidence], sourceTurns: [...item.dimensions.problemSolving.sourceTurns] },
      adaptability: { ...item.dimensions.adaptability, evidence: [...item.dimensions.adaptability.evidence], sourceTurns: [...item.dimensions.adaptability.sourceTurns] }
    },
    strengths: [...item.strengths],
    risks: [...item.risks],
    contradictions: [...item.contradictions],
    unresolvedConcerns: [...item.unresolvedConcerns]
  })),
  templates: seedTemplates.map(item => ({ ...item })),
  emails: seedEmails.map(item => ({ ...item, attachments: [...item.attachments] })),
  mailSettings: { ...seedMailSettings }
});
