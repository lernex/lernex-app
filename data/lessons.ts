import { Lesson } from "@/types";

export const lessons: Lesson[] = [
  {
    id: "algebra-1",
    subject: "Algebra",
    title: "Slope of a Line",
    content: "Slope m = (y₂−y₁)/(x₂−x₁). Positive→rising, negative→falling.",
    question: {
      prompt: "What is the slope between (2,3) and (5,9)?",
      choices: ["2", "3/2", "6/3", "2/3"],
      correctIndex: 1,
    },
  },
  {
    id: "bio-1",
    subject: "Biology",
    title: "Mitochondria",
    content: "Mitochondria generate ATP via cellular respiration.",
    question: {
      prompt: "Main function of mitochondria?",
      choices: ["Protein synthesis", "ATP production", "DNA replication", "Lipid storage"],
      correctIndex: 1,
    },
  },
  {
    id: "geo-1",
    subject: "Geometry",
    title: "Triangle Angles",
    content: "Interior angles of a triangle always sum to 180°.",
    question: {
      prompt: "If two angles are 50° and 60°, the third is…",
      choices: ["60°", "70°", "80°", "90°"],
      correctIndex: 1,
    },
  },
];
