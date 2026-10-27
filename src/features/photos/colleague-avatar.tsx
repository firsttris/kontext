/** A colleague's avatar by account id or address: their profile photo, else their initials. */
import { Avatar } from "@/components/ui/avatar";
import { useColleaguePhotoOf } from "./queries";

export const ColleagueAvatar = ({
  id,
  email,
  ...rest
}: {
  id?: string | null;
  email?: string | null;
  name: string;
  size?: number;
  className?: string;
}) => {
  const photoOf = useColleaguePhotoOf();
  return <Avatar {...rest} photo={photoOf({ id, email })} />;
};
