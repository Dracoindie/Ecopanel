import { existsSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { seedJobs, seedMailSettings, seedTemplates, DEMO_COMPANY } from "../lib/demo-data";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Configure PostgreSQL before seeding.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "nexora-labs" },
    update: { name: DEMO_COMPANY },
    create: { name: DEMO_COMPANY, slug: "nexora-labs" }
  });

  for (const job of seedJobs) {
    const publishedAt = job.status === "Published" ? new Date(job.publishedAt ?? job.createdAt) : null;
    const data = {
      organizationId: organization.id,
      title: job.title,
      department: job.department,
      location: job.location,
      workplace: job.workplace,
      employmentType: job.employmentType,
      shortDescription: job.shortDescription,
      description: job.description,
      responsibilities: job.responsibilities as Prisma.InputJsonValue,
      qualifications: job.qualifications as Prisma.InputJsonValue,
      salaryRange: job.salaryRange,
      status: job.status,
      publicVisible: job.publicVisible,
      publishedAt
    };
    await prisma.job.upsert({
      where: { id: job.id },
      update: data,
      create: { id: job.id, ...data, createdAt: new Date(job.createdAt) }
    });
  }

  for (const template of seedTemplates) {
    const data = {
      organizationId: organization.id,
      name: template.name,
      category: template.category,
      description: template.description,
      subject: template.subject,
      body: template.body
    };
    await prisma.emailTemplate.upsert({
      where: { id: template.id },
      update: data,
      create: { id: template.id, ...data }
    });
  }

  await prisma.mailSettings.upsert({
    where: { organizationId: organization.id },
    update: {
      senderName: seedMailSettings.senderName,
      senderAddress: seedMailSettings.senderAddress,
      replyTo: seedMailSettings.replyTo,
      signature: seedMailSettings.signature,
      provider: "Not connected",
      deliveryStatus: "Demo mode"
    },
    create: {
      organizationId: organization.id,
      senderName: seedMailSettings.senderName,
      senderAddress: seedMailSettings.senderAddress,
      replyTo: seedMailSettings.replyTo,
      signature: seedMailSettings.signature,
      provider: "Not connected",
      deliveryStatus: "Demo mode"
    }
  });

  console.log(`Seeded ${seedJobs.length} jobs and ${seedTemplates.length} email templates for ${organization.name}.`);
  console.log("No admin account was created. Run npm run bootstrap:admin with one-time environment variables.");
}

main()
  .catch(error => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
