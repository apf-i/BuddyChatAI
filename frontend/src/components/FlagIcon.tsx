import ReactCountryFlag from 'react-country-flag';
import { getLocationCountryCode } from '../utils/flags';

interface FlagIconProps {
  location: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
  size?: number;
}

export default function FlagIcon({ location, className, style, size = 16 }: FlagIconProps) {
  const countryCode = getLocationCountryCode(location);
  
  if (!countryCode) {
    return null;
  }
  
  // Flags have a 3:2 aspect ratio, so make width 1.5x the height
  const flagWidth = size * 1.5;
  
  return (
    <ReactCountryFlag
      countryCode={countryCode}
      svg
      style={{
        width: `${flagWidth}px`,
        height: `${size}px`,
        ...style
      }}
      className={className}
      title={location || ''}
    />
  );
}
