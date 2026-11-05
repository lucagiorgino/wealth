import {
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  Image,
  Wallet,
} from "lucide-react";

const icons = {
  wallet: Wallet,
  landmark: Landmark,
  "credit-card": CreditCard,
  "piggy-bank": PiggyBank,
  banknote: Banknote,
  custom: Image,
};

export function WalletIcon({ icon, colour, imageUrl }) {
  if (icon === "custom" && imageUrl) {
    return (
      // Stored, normalized private PNG data URLs never contact the source website.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className="size-5 shrink-0 object-contain" />
    );
  }
  const Icon = icons[icon];
  return (
    <Icon
      aria-hidden="true"
      style={{ color: colour }}
      className="size-5 shrink-0"
    />
  );
}
