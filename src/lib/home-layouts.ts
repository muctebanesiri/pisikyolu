export const HOME_LAYOUTS = [
  { id: "B", label: "سئچیلمیشلر", icon: "chat", group: "core", href: "/" },
  { id: "D", label: "سواللار", icon: "question", group: "core", href: "/questions" },
  { id: "A", label: "اپیزودلار", icon: "list", group: "core", href: "/episodes" },
  { id: "G", label: "ادعالار", icon: "bolt", group: "lab", href: "/assertions" },
  { id: "I", label: "حیرتلر", icon: "loop", group: "lab", href: "/wonderings" },
  { id: "J", label: "سوزلوک", icon: "seed", group: "lab", href: "/words" },
] as const;

export type HomeLayoutId = (typeof HOME_LAYOUTS)[number]["id"];
export type HomeLayout = (typeof HOME_LAYOUTS)[number];
