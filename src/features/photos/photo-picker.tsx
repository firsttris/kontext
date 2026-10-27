/** The photo with "Foto wählen" and "Foto entfernen": for one's profile and for a contact. */
import { Camera, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export const PhotoPicker = ({
  name,
  photo,
  busy = false,
  onPick,
  onRemove,
}: {
  name: string;
  photo?: string;
  busy?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} photo={photo} size={64} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => input.current?.click()}>
          <Camera size={15} /> {photo ? m.photo_change() : m.photo_choose()}
        </Button>
        {photo ? (
          <Button variant="ghost" disabled={busy} onClick={onRemove}>
            <Trash2 size={15} /> {m.photo_remove()}
          </Button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label={m.photo_label()}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
};
