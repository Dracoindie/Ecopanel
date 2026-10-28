import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { requireE2eEnv } from "./env";

const env = requireE2eEnv();
const JOB_ID = "e2e-role";
const cleanPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const eicarPdf = Buffer.concat([cleanPdf, Buffer.from("\nEICAR-STANDARD-ANTIVIRUS-TEST-FILE")]);

function unique(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

async function fillApplication(page: Page, input: { name: string; email: string; filename: string; buffer: Buffer }) {
  await page.goto(`/careers/apply/${JOB_ID}`);
  await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();
  await page.getByLabel(/Full name/).fill(input.name);
  await page.getByLabel(/Email address/).fill(input.email);
  await page.getByLabel(/Phone number/).fill("+44 7700 900444");
  await page.getByLabel(/Why this role/).fill("This cover letter is long enough to pass the public application validation rules.");
  await page.getByLabel("Upload CV").setInputFiles({
    name: input.filename,
    mimeType: "application/pdf",
    buffer: input.buffer
  });
  await page.getByRole("checkbox").check();
}

async function submitApplication(page: Page, input: { name: string; email: string; filename?: string; buffer?: Buffer }) {
  await fillApplication(page, {
    name: input.name,
    email: input.email,
    filename: input.filename || "clean-cv.pdf",
    buffer: input.buffer || cleanPdf
  });
  await page.getByRole("button", { name: "Submit application" }).click();
  await page.waitForURL(/\/careers\/applications\/[^/]+$/, { timeout: 20_000 });
}

async function openApplicant(page: Page, name: string, email: string) {
  await page.goto("/hr/applicants");
  const search = page.getByLabel("Search applicants");
  await search.fill(email);
  const link = page.getByRole("link", { name: new RegExp(name) }).first();
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.click();
  await page.waitForURL(/\/hr\/applicants\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.describe("candidate to HR recruitment workflow", () => {
  test("submits a clean CV, downloads it, changes stage, adds a note, and enforces organization isolation", async ({ page, browser }) => {
    const name = `Clean Candidate ${unique("run")}`;
    const email = `${unique("clean")}@example.test`;

    await submitApplication(page, { name, email });
    await expect(page.getByText("Application received", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Private storage · scanned")).toBeVisible();

    await openApplicant(page, name, email);

    await expect(page.getByText("Scanned and cleared")).toBeVisible();
    const downloadLink = page.getByRole("link", { name: /Download CV/ });
    const downloadHref = await downloadLink.getAttribute("href");
    expect(downloadHref).toMatch(/^\/api\/hr\/cv\/[^/]+$/);

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("clean-cv.pdf");
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const downloaded = await readFile(downloadedPath!);
    expect(downloaded.subarray(0, 5).toString()).toBe("%PDF-");

    const applicationPath = new URL(page.url()).pathname;
    const stage = page.getByLabel("Change application stage");
    await stage.selectOption("Shortlisted");
    await page.getByRole("button", { name: "Update stage" }).click();
    await expect(stage).toHaveValue("Shortlisted");
    await expect(page.getByText(/Application moved to Shortlisted/)).toBeVisible();

    const note = `E2E private note ${unique("note")}`;
    await page.getByPlaceholder(/Add a private note/).fill(note);
    await page.getByRole("button", { name: /Save note/ }).click();
    await expect(page.getByText(note)).toBeVisible();

    const otherContext = await browser.newContext({
      storageState: path.resolve(process.cwd(), "tests/e2e/.e2e-auth/other.json")
    });
    const otherPage = await otherContext.newPage();
    await otherPage.goto(applicationPath);
    await expect(otherPage.getByText("Application unavailable")).toBeVisible();
    const crossOrgCv = await otherPage.request.get(downloadHref!);
    expect(crossOrgCv.status()).toBe(404);
    await otherContext.close();
  });

  test("blocks an infected CV and refuses the download at the API boundary", async ({ page }) => {
    const name = `Infected Candidate ${unique("run")}`;
    const email = `${unique("infected")}@example.test`;

    await submitApplication(page, { name, email, filename: "infected-cv.pdf", buffer: eicarPdf });
    await expect(page.getByText("Blocked · malware detected")).toBeVisible();

    await openApplicant(page, name, email);
    await expect(page.getByText("Blocked: malware detected")).toBeVisible();
    await expect(page.getByText("Download blocked")).toBeVisible();

    const applicationId = new URL(page.url()).pathname.split("/").pop();
    const detailResponse = await page.request.get(`/api/hr/applications/${applicationId}`);
    expect(detailResponse.status()).toBe(200);
    const detail = await detailResponse.json() as {
      application: { cv: { scanStatus: string; downloadable: boolean; downloadUrl: string } };
    };
    expect(detail.application.cv.scanStatus).toBe("INFECTED");
    expect(detail.application.cv.downloadable).toBe(false);
    const cvResponse = await page.request.get(detail.application.cv.downloadUrl);
    expect(cvResponse.status()).toBe(410);
  });

  test("rejects a duplicate application for the same role and email", async ({ page }) => {
    const name = `Duplicate Candidate ${unique("run")}`;
    const email = `${unique("duplicate")}@example.test`;

    await submitApplication(page, { name, email });
    await expect(page.getByText("Application received", { exact: true }).first()).toBeVisible();

    await fillApplication(page, { name, email, filename: "second-cv.pdf", buffer: cleanPdf });
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.locator('p[role="alert"]').filter({ hasText: /already applied/i })).toBeVisible({ timeout: 20_000 });
  });

  test("shows validation errors without submitting", async ({ page }) => {
    await page.goto(`/careers/apply/${JOB_ID}`);
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();
    await expect(page.getByText("Attach your CV.").first()).toBeVisible();
    await expect(page.getByText("Consent is required to submit your application.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/careers/apply/${JOB_ID}$`));
  });

  test("requires a recruiter session for the HR portal", async ({ browser }) => {
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anonymous.newPage();
    await page.goto("/hr/applicants");
    await page.waitForURL(/\/hr\/login/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await anonymous.close();
  });

  test("shows an honest error when applicant data is unavailable", async ({ page }) => {
    await page.route(/\/api\/hr\/applications\?/, async route => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Recruitment data is temporarily unavailable.", code: "DATA_UNAVAILABLE" })
      });
    });
    await page.goto("/hr/applicants");
    await expect(page.getByText("Recruitment data is temporarily unavailable.")).toBeVisible();
    await expect(page.getByText("No applicants match those filters")).toHaveCount(0);
  });

  test("persists job publishing, interview scheduling, honest reports, and queued email", async ({ page, browser }) => {
    const suffix = unique("phase2b");
    const name = `Phase 2B Candidate ${suffix}`;
    const email = `${suffix}@example.test`;
    const jobTitle = `Phase 2B Platform Engineer ${suffix}`;

    await submitApplication(page, { name, email });
    await expect(page.getByText("Application received", { exact: true }).first()).toBeVisible();

    await page.goto("/hr/jobs/new");
    await page.getByLabel(/Job title/).fill(jobTitle);
    await page.getByLabel(/Department/).selectOption("Engineering");
    await page.getByLabel(/Location/).fill("London");
    await page.getByLabel(/Salary range/).fill("£90,000 - £110,000");
    await page.getByLabel(/Short description/).fill("Build the persisted Phase 2B recruitment platform with the hiring team.");
    await page.getByLabel(/Full description/).fill("This is a fully persisted role description for the Phase 2B browser test. It covers the platform work, collaboration expectations, and delivery responsibilities in enough detail to pass validation.");
    await page.getByLabel(/Responsibilities/).fill("Build reliable recruitment APIs\nCollaborate with product and design");
    await page.getByLabel(/Qualifications/).fill("Strong TypeScript experience\nPostgreSQL experience");
    await page.getByRole("button", { name: "Publish role" }).click();
    await page.waitForURL(/\/hr\/jobs\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: jobTitle })).toBeVisible();
    const jobId = new URL(page.url()).pathname.split("/").pop()!;
    const careersJob = await page.request.get(`/api/careers/jobs/${jobId}`);
    expect(careersJob.status()).toBe(200);

    const otherContext = await browser.newContext({
      storageState: path.resolve(process.cwd(), "tests/e2e/.e2e-auth/other.json")
    });
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`/hr/jobs/${jobId}`);
    await expect(otherPage.getByText("Job unavailable")).toBeVisible();
    await otherContext.close();

    await page.goto("/hr/schedule");
    await expect(page.getByRole("heading", { name: "Google Calendar" })).toBeVisible();
    await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Schedule", exact: true }).click();
    await page.getByLabel("Candidate & application").selectOption({ label: `${name} - E2E Product Engineer` });
    await page.getByRole("textbox", { name: "Date", exact: true }).fill("2026-12-15");
    await page.getByRole("textbox", { name: "Time", exact: true }).fill("10:30");
    await page.getByLabel("Duration").selectOption("45");
    const scheduleResponsePromise = page.waitForResponse(response => response.url().endsWith("/api/hr/interviews") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Schedule interview" }).click();
    const scheduleResponse = await scheduleResponsePromise;
    expect(scheduleResponse.status()).toBe(201);
    const scheduled = await scheduleResponse.json() as { interview: { id: string } };

    await page.goto(`/hr/interviews/${scheduled.interview.id}`);
    await expect(page.getByRole("heading", { name: `Interview with ${name}` })).toBeVisible();
    await expect(page.getByText("Calendar not connected", { exact: true })).toBeVisible();
    await expect(page.getByText("No assessment is linked to this interview.")).toBeVisible();
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByText("Interview marked complete. No assessment was generated.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open report" })).toHaveCount(0);

    await page.goto(`/hr/interviews/${scheduled.interview.id}/report`);
    await expect(page.getByText("No report is linked to this interview")).toBeVisible();

    await page.goto("/hr/email/compose");
    await page.getByRole("button", { name: new RegExp(name) }).first().click();
    const subject = `Phase 2B queued message ${suffix}`;
    await page.getByLabel("Subject", { exact: true }).fill(subject);
    await page.getByLabel("Message body", { exact: true }).fill("This is a persisted Phase 2B message body that is long enough for the composer validation rules.");
    await page.getByRole("button", { name: "Queue message" }).click();
    await page.getByRole("button", { name: "Queue without provider" }).click();
    await page.waitForURL(/\/hr\/email\/activity$/, { timeout: 20_000 });
    await expect(page.getByText(subject)).toBeVisible();
    await expect(page.getByText("Queued", { exact: true }).first()).toBeVisible();

    const messagesResponse = await page.request.get("/api/hr/email/messages");
    expect(messagesResponse.status()).toBe(200);
    const messages = await messagesResponse.json() as { messages: Array<{ subject: string; status: string }> };
    const queued = messages.messages.find(message => message.subject === subject);
    expect(queued?.status).toBe("Queued");
    expect(messages.messages.some(message => message.status === "Sent")).toBe(false);
  });
});
