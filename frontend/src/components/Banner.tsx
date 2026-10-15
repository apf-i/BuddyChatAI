import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Banner.css';

interface BannerProps {
  imageUrl?: string;
}

export default function Banner({ imageUrl }: BannerProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  
  // If no imageUrl provided, try to load from public folder
  const bannerImage = imageUrl || '/BUDDYBANNER.png';

  const handleBannerClick = () => {
    if (!isAuthenticated) {
      navigate('/signup');
    }
  };

  return (
    <div className="banner-container">
      <img 
        src={bannerImage} 
        alt="Site Banner" 
        className={`banner-image ${!isAuthenticated ? 'banner-clickable' : ''}`}
        onClick={handleBannerClick}
        onError={(e) => {
          // Hide banner if image fails to load
          (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
        }}
      />
    </div>
  );
}
