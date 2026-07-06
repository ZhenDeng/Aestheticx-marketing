import { describe, it, expect } from "vitest";
import { formAnswersComplete, type FormQuestion } from "@/lib/demo/forms";
import type { FormAnswer } from "@/lib/demo/types";

// Owner feedback #6: the consent form's record button stays disabled until every question
// has an explicit answer AND any required "Yes" detail is filled.
const questions: FormQuestion[] = [
  { id: "q-yn", prompt: "Yes/No, no detail", kind: { type: "yesNo", detailPrompt: null } },
  { id: "q-yn-detail", prompt: "Yes/No, detail on yes", kind: { type: "yesNo", detailPrompt: "Which?" } },
  { id: "q-text", prompt: "Free text", kind: { type: "text" } },
];
const template = { questions };

function answers(...entries: FormAnswer[]): Record<string, FormAnswer> {
  return Object.fromEntries(entries.map((a) => [a.questionID, a]));
}

describe("formAnswersComplete (#6)", () => {
  it("is false when a question is untouched", () => {
    expect(formAnswersComplete(template, {})).toBe(false);
    // only two of three answered
    expect(formAnswersComplete(template, answers(
      { questionID: "q-yn", answer: false, detail: "" },
      { questionID: "q-text", answer: true, detail: "note" },
    ))).toBe(false);
  });

  it("is false when a 'Yes' needs detail but it is blank", () => {
    expect(formAnswersComplete(template, answers(
      { questionID: "q-yn", answer: false, detail: "" },
      { questionID: "q-yn-detail", answer: true, detail: "   " },
      { questionID: "q-text", answer: true, detail: "note" },
    ))).toBe(false);
  });

  it("is false when a free-text answer is blank", () => {
    expect(formAnswersComplete(template, answers(
      { questionID: "q-yn", answer: false, detail: "" },
      { questionID: "q-yn-detail", answer: false, detail: "" },
      { questionID: "q-text", answer: true, detail: "" },
    ))).toBe(false);
  });

  it("is true when every question is answered and required details are filled", () => {
    expect(formAnswersComplete(template, answers(
      { questionID: "q-yn", answer: true, detail: "" },
      { questionID: "q-yn-detail", answer: true, detail: "latex" },
      { questionID: "q-text", answer: true, detail: "note" },
    ))).toBe(true);
  });

  it("does not require detail when a detail-question is answered No", () => {
    expect(formAnswersComplete(template, answers(
      { questionID: "q-yn", answer: false, detail: "" },
      { questionID: "q-yn-detail", answer: false, detail: "" },
      { questionID: "q-text", answer: true, detail: "note" },
    ))).toBe(true);
  });
});
