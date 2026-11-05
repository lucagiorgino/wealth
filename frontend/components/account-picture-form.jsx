"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateProfilePictureAction } from "@/app/(app)/account/actions";
import { AccountAvatar } from "@/components/account-avatar";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  AccountInputError,
  accountIcons,
  validateAvatarFile,
} from "@/lib/account";

export function AccountPictureForm({ account }) {
  const inputRef = useRef(null);
  const [picture, setPicture] = useState(
    account.avatar_url ? "custom" : account.icon,
  );
  const [preview, setPreview] = useState(null);
  const [inputError, setInputError] = useState(null);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const [state, action, pending] = useActionState(async (previous, form) => {
    const result = await updateProfilePictureAction(previous, form);
    if (result.success) {
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    }
    return { ...result, picture: form.get("picture") };
  }, {});
  return (
    <form
      action={action}
      aria-label="Profile picture"
      className="space-y-5 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
      onReset={(event) => event.preventDefault()}
    >
      <div className="space-y-1">
        <h3 className="font-semibold">Profile picture</h3>
        <p className="text-sm text-muted-foreground">
          One picture for your sidebar and dashboard.
        </p>
      </div>
      <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
        <AccountAvatar
          icon={picture === "custom" ? account.icon : picture}
          avatarUrl={
            picture === "custom" ? (preview ?? account.avatar_url) : null
          }
          className="size-16 shrink-0"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Your preview</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Changes appear after you save.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-picture">Profile picture</Label>
        <NativeSelect
          id="account-picture"
          name="picture"
          value={picture}
          disabled={pending}
          onChange={(event) => {
            setPicture(event.target.value);
            setPreview(null);
            setInputError(null);
          }}
          aria-describedby="account-picture-help"
        >
          {accountIcons.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value="custom">
            Custom image (upload)
          </NativeSelectOption>
        </NativeSelect>
        <p id="account-picture-help" className="text-sm text-muted-foreground">
          Choose an existing icon or upload a custom image. Saving an icon
          replaces your custom image.
        </p>
      </div>
      {picture === "custom" && (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <Label htmlFor="account-image">Custom profile image</Label>
          <Input
            ref={inputRef}
            id="account-image"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            required
            disabled={pending}
            aria-describedby="account-image-help"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setInputError(null);
              if (!file) {
                setPreview(null);
                return;
              }
              try {
                validateAvatarFile(file);
              } catch (error) {
                if (!(error instanceof AccountInputError)) throw error;
                setInputError(error.message);
                setPreview(null);
                event.target.value = "";
                return;
              }
              setPreview(URL.createObjectURL(file));
            }}
          />
          <p id="account-image-help" className="text-sm text-muted-foreground">
            PNG, JPEG, or WebP; up to 2 MiB and 4096 pixels per side. Images are
            resized to at most 256 pixels and metadata is removed. Animated
            images are not supported.
          </p>
        </div>
      )}
      <Feedback
        state={{
          error: inputError || (state.picture === picture && state.error),
          success: state.picture === picture && !preview && state.success,
        }}
      />
      <Button type="submit" disabled={pending || Boolean(inputError)}>
        {pending ? "Saving..." : "Save profile picture"}
      </Button>
    </form>
  );
}
