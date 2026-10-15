import { useNavigate } from 'react-router-dom';
import './TokenStoreBanner.css';

interface TokenStoreBannerProps {
  imageUrl?: string;
}

export default function TokenStoreBanner({ imageUrl }: TokenStoreBannerProps) {
  const navigate = useNavigate();

  // If no imageUrl provided, try to load from public folder
  const bannerImage = imageUrl || '/TOKENBANNER.png'; // Place TOKENBANNER.png in frontend/public/ folder

  const handleClick = () => {
    navigate('/purchase-tokens');
  };

  return (
    <div className="token-store-banner-container" onClick={handleClick}>
      <img 
        src={bannerImage} 
        alt="Token Store Banner" 
        className="token-store-banner-image token-store-banner-clickable"
        onError={(e) => {
          // Log error for debugging
          console.error('❌ Token store banner image failed to load:', bannerImage);
          console.error('Full URL:', window.location.origin + bannerImage);
          console.error('Image element:', e.currentTarget);
          // Keep the container visible with a background color so we can see it
          const container = e.currentTarget.parentElement;
          if (container) {
            container.style.background = 'linear-gradient(135deg, #8b5cf6, #ec4899)';
            container.style.minHeight = '200px';
            container.style.borderRadius = '12px';
          }
          e.currentTarget.style.display = 'none';
        }}
        onLoad={() => {
          console.log('✅ Token store banner image loaded successfully:', bannerImage);
        }}
      />
    </div>
  );
}
