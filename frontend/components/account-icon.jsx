import { Cat, Rocket, Smile, UserRound } from "lucide-react";

const icons = {
  "user-round": UserRound,
  smile: Smile,
  cat: Cat,
  rocket: Rocket,
};

export function AccountIcon({ icon, ...props }) {
  const Icon = icons[icon];
  return <Icon {...props} />;
}
