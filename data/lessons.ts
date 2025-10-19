import { Lesson } from "@/types";

export const lessons: Lesson[] = [
  {
    id: "algebra-1",
    subject: "Algebra",
    title: "Slope of a Line",
    content: "Slope m = (y₂−y₁)/(x₂−x₁). Positive slopes rise, negative slopes fall. Zero slope ⇒ horizontal line.",
    mediaUrl: "https://images.unsplash.com/photo-1517976487492-576ea6a78c70?q=80&w=1400&auto=format&fit=crop",
    mediaType: "image",
    questions: [
      {
        prompt: "Slope between (2,3) and (5,9)?",
        choices: ["2", "3/2", "6/3", "2/3"],
        correctIndex: 1,
        explanation: "Slope is rise over run: (9-3)/(5-2) = 6/3 = 2.",
      },
    ]
  },
  {
    id: "bio-1",
    subject: "Biology",
    title: "Mitochondria",
    content: "Mitochondria generate ATP via cellular respiration. More mitochondria exist in cells with high energy demand.",
    mediaUrl: "https://images.unsplash.com/photo-1535930749574-1399327ce78f?q=80&w=1400&auto=format&fit=crop",
    mediaType: "image",
    questions: [
      {
        prompt: "Main function?",
        choices: ["Protein synthesis","ATP production","DNA replication","Lipid storage"],
        correctIndex: 1,
        explanation: "Mitochondria make ATP through cellular respiration.",
      },
      {
        prompt: "Where are they?",
        choices: ["Nucleus","Cytoplasm","Cell membrane","Golgi"],
        correctIndex: 1,
        explanation: "Mitochondria float freely in the cytoplasm.",
      },
    ]
  },
  {
    id: "geo-1",
    subject: "Geometry",
    title: "Triangle Angles",
    content: "Interior angles of a triangle add to 180°. If two are known, the third is 180° minus their sum.",
    mediaUrl: "https://images.unsplash.com/photo-1509223197845-458d87318791?q=80&w=1400&auto=format&fit=crop",
    mediaType: "image",
    questions: [
      {
        prompt: "If angles are 50° and 60°, third is…",
        choices: ["60°","70°","80°","90°"],
        correctIndex: 1,
        explanation: "Third angle is 180° - (50° + 60°) = 70°.",
      },
      {
        prompt: "Sum of angles?",
        choices: ["90°","120°","180°","360°"],
        correctIndex: 2,
        explanation: "All interior angles of a triangle always total 180°.",
      },
      {
        prompt: "Equilateral angle?",
        choices: ["45°","60°","90°","120°"],
        correctIndex: 1,
        explanation: "Each angle in an equilateral triangle measures 60°.",
      },
    ]
  }
];
