export const accountIcons = [
  { value: "user-round", label: "Person" },
  { value: "smile", label: "Smile" },
  { value: "cat", label: "Cat" },
  { value: "rocket", label: "Rocket" },
];

export class AccountInputError extends Error {}

export const avatarMaxBytes = 2 * 1024 * 1024;
export const avatarImageTypes = ["image/png", "image/jpeg", "image/webp"];

export function validAvatarUrl(value) {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length <= 436930 &&
      /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value))
  );
}

export function validateAvatarFile(file) {
  if (!(file instanceof File) || !file.size) {
    throw new AccountInputError("Choose a profile image.");
  }
  if (!avatarImageTypes.includes(file.type)) {
    throw new AccountInputError("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > avatarMaxBytes) {
    throw new AccountInputError("Profile images must not exceed 2 MiB.");
  }
  return file;
}

export function accountPayload(form) {
  const name = form.get("display_name");
  if (
    typeof name !== "string" ||
    !name.trim() ||
    [...name.trim()].length > 100
  ) {
    throw new AccountInputError("Enter a display name of 1 to 100 characters.");
  }
  return { display_name: name.trim() };
}

export function profilePicturePayload(form) {
  const picture = form.get("picture");
  if (picture === "custom") {
    return { kind: "image", file: validateAvatarFile(form.get("avatar")) };
  }
  if (!accountIcons.some((option) => option.value === picture)) {
    throw new AccountInputError("Choose a profile icon or custom image.");
  }
  return { kind: "icon", icon: picture };
}
