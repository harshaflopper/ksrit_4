// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, daysBetween } from "../lib/dates";
import { evaluateItem } from "../lib/evaluate";
import { discountForDaysLeft, getPricing, priceAfter } from "../lib/pricing";

const TODAY = "2026-10-09";
const ok = { category: "instant_noodles", mrp: 200, isFood: true, isPackaged: true, packCondition: "sealed" as const, dateConfirmed: true };

test("discount climbs every day from 20% (14 days) to 80% (last day)", () => {
  assert.equal(discountForDaysLeft(31), null);
  assert.equal(discountForDaysLeft(30), 10);
  assert.equal(discountForDaysLeft(15), 10);
  assert.equal(discountForDaysLeft(14), 20);
  assert.equal(discountForDaysLeft(1), 80);
  assert.equal(discountForDaysLeft(0), null);
  for (let d = 14; d > 1; d--) assert.ok(discountForDaysLeft(d - 1)! > discountForDaysLeft(d)!, `day ${d}`);
});

test("price rounds down and tomorrow is cheaper", () => {
  assert.equal(priceAfter(285, 52), 136);
  const p = getPricing(285, "2026-10-16", TODAY); // 7 days left
  assert.equal(p.daysLeft, 7);
  assert.equal(p.stage, "dropping");
  assert.ok(p.tomorrow!.price < p.price!);
  assert.equal(p.ladder.length, 14);
});

test("stages", () => {
  assert.equal(getPricing(100, "2026-10-10", TODAY).stage, "last_day");
  assert.equal(getPricing(100, "2026-10-09", TODAY).stage, "expired");
  assert.equal(getPricing(100, "2026-11-01", TODAY).stage, "early");
  assert.equal(getPricing(100, "2026-11-01", TODAY).dropStartsOn, "2026-10-18");
  assert.equal(getPricing(100, "2026-12-31", TODAY).stage, "too_fresh");
});

test("listable green item", () => {
  const e = evaluateItem({ ...ok, expiryDate: "2026-10-16" }, TODAY);
  assert.equal(e.listable, true, e.blockers.join("; "));
});

test("blocks red categories, expired, too fresh, opened, unconfirmed date, missing MRP", () => {
  assert.equal(evaluateItem({ ...ok, category: "fresh_dairy", expiryDate: "2026-10-12" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, category: "baby_food", expiryDate: "2026-10-12" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, expiryDate: "2026-10-08" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, expiryDate: "2027-03-01" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, packCondition: "opened", expiryDate: "2026-10-12" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, dateConfirmed: false, expiryDate: "2026-10-12" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, mrp: null, expiryDate: "2026-10-12" }, TODAY).listable, false);
  assert.equal(evaluateItem({ ...ok, isPackaged: false, expiryDate: "2026-10-12" }, TODAY).listable, false);
});

test("amber items list with a warning", () => {
  const e = evaluateItem({ ...ok, category: "packaged_cakes", expiryDate: "2026-10-12" }, TODAY);
  assert.equal(e.listable, true);
  assert.ok(e.warnings.length > 0);
});

test("date helpers", () => {
  assert.equal(daysBetween("2026-10-09", "2026-10-16"), 7);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-04-15", 9), "2027-01-15");
});
