import { ASSESSMENT_DIMENSION_KEYS, type AssessmentDimensionKey } from "@/lib/server/assessment/types";

export const ASSESSMENT_RUBRIC_VERSION = "2026-10-27.1";
export const ASSESSMENT_PROMPT_VERSION = "2026-10-27.1";

export interface RubricDimension {
  label: string;
  description: string;
  anchors: Record<"0-2" | "3-5" | "6-7" | "8-10", string>;
}

export const ASSESSMENT_RUBRIC: Record<AssessmentDimensionKey, RubricDimension> = {
  technical: {
    label: "Technical depth",
    description: "Correctness, depth, trade-offs, reliability, and evidence of hands-on technical judgement relevant to the role.",
    anchors: {
      "0-2": "No relevant technical evidence, incorrect claims, or only generic terminology.",
      "3-5": "Limited or surface-level technical evidence with major gaps or unresolved ambiguity.",
      "6-7": "Credible technical reasoning with concrete examples, although depth or trade-off analysis is uneven.",
      "8-10": "Specific, correct, and well-reasoned technical evidence with clear trade-offs, constraints, and outcomes."
    }
  },
  product: {
    label: "Product judgement",
    description: "Customer impact, prioritisation, product decisions, business outcomes, and trade-offs relevant to the role.",
    anchors: {
      "0-2": "No relevant product judgement or only unsupported assertions.",
      "3-5": "Basic customer awareness but weak prioritisation, outcomes, or decision rationale.",
      "6-7": "Reasonable customer and business reasoning with at least one concrete decision example.",
      "8-10": "Strong outcome-oriented judgement with explicit customer value, prioritisation, and trade-off reasoning."
    }
  },
  communication: {
    label: "Communication",
    description: "Clarity, structure, precision, listening, and the ability to explain complex work without inflated claims.",
    anchors: {
      "0-2": "Answers are unintelligible, contradictory, or provide no usable signal.",
      "3-5": "Understandable but disorganised, vague, or heavily reliant on interviewer prompting.",
      "6-7": "Generally clear and structured with some unnecessary detail or ambiguity.",
      "8-10": "Consistently clear, concise, well-structured, and responsive to the question asked."
    }
  },
  problemSolving: {
    label: "Problem solving",
    description: "Diagnosis, reasoning under constraints, handling ambiguity, and revision when assumptions change.",
    anchors: {
      "0-2": "No usable problem-solving evidence or reasoning is fundamentally incorrect.",
      "3-5": "Recognises the problem but jumps to solutions or misses important constraints.",
      "6-7": "Reasonable diagnosis and approach with some gaps in validation or edge cases.",
      "8-10": "Methodical diagnosis, explicit assumptions, sound trade-offs, and adaptation when constraints change."
    }
  },
  adaptability: {
    label: "Adaptability",
    description: "Learning, responding to new constraints, incorporating feedback, and handling uncertainty or disagreement.",
    anchors: {
      "0-2": "No relevant evidence or rigid, unsupported responses to changed constraints.",
      "3-5": "Limited evidence of adjustment; relies on a single approach.",
      "6-7": "Adjusts approach when prompted and explains the change plausibly.",
      "8-10": "Actively incorporates new information, revises assumptions, and explains the resulting trade-offs."
    }
  }
};

export const ASSESSMENT_DIMENSION_LABELS = Object.fromEntries(
  ASSESSMENT_DIMENSION_KEYS.map(key => [key, ASSESSMENT_RUBRIC[key].label])
) as Record<AssessmentDimensionKey, string>;
