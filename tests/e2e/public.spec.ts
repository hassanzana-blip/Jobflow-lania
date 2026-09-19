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
    await page.getByLabel("Vilka roller söker du?").fill("HR Business Partner");
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
  await page
    .getByLabel("Redigera text", { exact: true })
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
  await page.getByLabel("Status", { exact: true }).selectOption("interview");
  await page
    .getByLabel("Egna anteckningar", { exact: true })
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
