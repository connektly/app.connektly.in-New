import { useEffect, useState } from 'react';

function getInitials(value: string | null | undefined) {
  const segments = (value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (segments.length === 0) {
    return 'U';
  }

  return segments.map((segment) => segment.charAt(0).toUpperCase()).join('');
}

export default function UserAvatar({
  name,
  imageUrl,
  alt,
  className = '',
  initialsClassName = '',
}: {
  name?: string | null;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
  initialsClassName?: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [imageUrl]);

  if (imageUrl && !hasImageError) {
    return (
      <img
        src={imageUrl}
        alt={alt || name || 'User avatar'}
        onError={() => setHasImageError(true)}
        className={`rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-[#5b45ff] to-[#25D366] text-white ${className} ${initialsClassName}`}
    >
      {getInitials(name)}
    </div>
  );
}
