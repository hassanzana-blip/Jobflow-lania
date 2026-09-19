import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [320, 360, 375, 390, 393, 430, 1440]) {
  test(`mobile app and forms at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/produktvisning");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Ditt nästa",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const nav = page.locator(
      width < 1024 ? ".jf-bottom-nav" : ".jf-desktop-nav nav",
    );
    await nav.getByRole("button", { name: "Profil", exact: true }).click();
    await page.getByLabel("Ditt namn", { exact: true }).fill("Sara");
    await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await page
      .getByLabel("Vilka roller söker du?", { exact: true })
      .fill("HR Business Partner");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await page
      .getByLabel("Jag har läst igenom och bekräftar att uppgifterna stämmer.")
      .check();
    await page
      .getByRole("button", { name: "Bekräfta och spara profil" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Din profil är sparad." }),
    ).toBeVisible();
  });
}
test("mobile save, dismiss, undo, prepare, edit and review flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/produktvisning");
  await expect(
    page.getByText("Exempelprofil och fiktiva jobb. Inget skickas."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Spara jobbet", exact: true })
    .first()
    .click();
  await page
    .locator(".jf-bottom-nav")
    .getByRole("button", { name: "Sparade", exact: true })
    .click();
  await expect(page.locator(".jf-job-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Se jobbet", exact: true }).click();
  await page.getByRole("button", { name: "Inte för mig", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Jobbet är dolt.");
  await page.getByRole("button", { name: "Ångra", exact: true }).click();
  await page.getByRole("button", { name: "Se jobbet", exact: true }).click();
  await page
    .getByRole("button", { name: "Förbered ansökan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Din ansökan");
  // By role, not by label text: the <label> wraps the <textarea>, so its
  // textContent carries the draft as well. The accessible name is correct.
  await page
    .getByRole("textbox", { name: "Redigera text", exact: true })
    .fill("HR-specialist med erfarenhet av arbetsrätt.");
  await page
    .getByLabel(
      "Jag har granskat texten och bekräftar att uppgifterna stämmer.",
    )
    .check();
  await page
    .getByRole("button", { name: "Spara granskad version", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ladda ner exempeltext" }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("interview");
  await page
    .getByRole("textbox", { name: "Egna anteckningar", exact: true })
    .fill("Förbered frågor till intervjun.");
  await page
    .getByRole("button", { name: "Spara ändringar", exact: true })
    .click();
  await page.getByRole("button", { name: "Stäng", exact: true }).click();
  await page
    .locator(".jf-bottom-nav")
    .getByRole("button", { name: "Ansökningar", exact: true })
    .click();
  await expect(page.locator(".jf-application-row")).toContainText("Intervju");
});
test("dialog traps focus and keyboard Escape closes it", async ({ page }) => {
  await page.goto("/produktvisning");
  await page
    .getByRole("button", { name: "Se jobbet", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("public routes and mobile detail have no automated WCAG AA violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/produktvisning", "/kom-igang"]) {
    await page.goto(route);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
  }
  await page.goto("/produktvisning");
  await page
    .getByRole("button", { name: "Se jobbet", exact: true })
    .first()
    .click();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});
test("a failed sign-in is visible without scrolling and is announced", async ({
  page,
}) => {
  // Regression: the message used to render below the submit button, off-screen
  // on a phone, so a rejected sign-in looked like nothing had happened.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logga-in");
  await page.getByLabel("E-postadress").fill("jousef@example.com");
  await page.getByLabel("Lösenord").fill("ett-riktigt-langt-losenord");
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
  // Scoped by id: Next.js keeps its own empty route-announcer alert on the page.
  const alert = page.locator("#auth-feedback");
  await expect(alert).not.toBeEmpty();
  await expect(alert).toBeInViewport();
  const [alertBottom, buttonTop] = await Promise.all([
    alert.evaluate((el) => el.getBoundingClientRect().bottom),
    page
      .getByRole("button", { name: "Logga in", exact: true })
      .evaluate((el) => el.getBoundingClientRect().top),
  ]);
  expect(alertBottom).toBeLessThanOrEqual(buttonTop);
});
test("a broken e-mail link explains itself instead of redirecting silently", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lankfel?orsak=expired");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Länken fungerade inte.",
  );
  await expect(page.getByText("Länken har gått ut.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Återställ lösenordet" })).toBeVisible();
  // An unknown reason — including one that names an Object.prototype member —
  // must still produce a readable page, not a crash.
  for (const orsak of ["%3Cscript%3E", "toString", "__proto__"]) {
    await page.goto(`/lankfel?orsak=${orsak}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Länken gick inte att använda.")).toBeVisible();
  }
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});
test("the public job search keeps its query in the URL", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // A shared link opens with the search already applied.
  await page.goto("/hitta-jobb?q=utvecklare&arbetsform=remote");
  await expect(page.getByLabel("Sök bland jobben")).toHaveValue("utvecklare");
  await expect(
    page.getByRole("button", { name: "Distans", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // Changing the filter rewrites the URL so the state survives a reload.
  await page.getByRole("button", { name: "Hybrid", exact: true }).click();
  await expect(page).toHaveURL(/arbetsform=hybrid/);
  await expect(page).toHaveURL(/q=utvecklare/);
});
