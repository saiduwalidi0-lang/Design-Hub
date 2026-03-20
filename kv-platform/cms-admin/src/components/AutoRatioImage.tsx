import React, { useMemo, useState } from 'react';

export function AutoRatioImage({
  src,
  alt,
  fallbackRatio = 4 / 3,
  containerClassName = '',
  imgClassName = '',
  children,
}: {
  src: string;
  alt?: string;
  fallbackRatio?: number;
  containerClassName?: string;
  imgClassName?: string;
  children?: React.ReactNode;
}) {
  const [ratio, setRatio] = useState<number>(fallbackRatio);
  const style = useMemo(() => ({ aspectRatio: String(ratio) }), [ratio]);

  return (
    <div className={containerClassName} style={style}>
      <img
        src={src}
        alt={alt || ''}
        className={`w-full h-full object-contain ${imgClassName}`}
        onLoad={e => {
          const el = e.currentTarget;
          const w = el.naturalWidth;
          const h = el.naturalHeight;
          if (w > 0 && h > 0) {
            const next = w / h;
            setRatio(prev => (prev === next ? prev : next));
          }
        }}
      />
      {children}
    </div>
  );
}

