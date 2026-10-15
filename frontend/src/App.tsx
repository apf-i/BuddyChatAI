import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Gallery from './pages/Gallery';
import Browse from './pages/Browse';
import Search from './pages/Search';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Chat from './pages/Chat';
import PurchaseTokens from './pages/PurchaseTokens';
import AdminTemplateUpload from './pages/AdminTemplateUpload';
import EditCharacter from './pages/EditCharacter';
import CharacterDetail from './pages/CharacterDetail';
import GoogleCallback from './pages/GoogleCallback';
import Profile from './pages/Profile';
import ProfileSettings from './pages/ProfileSettings';
import Favorites from './pages/Favorites';
import UploadCharacter from './pages/UploadCharacter';
import MyUploads from './pages/MyUploads';
import ModerationDashboard from './pages/ModerationDashboard';
import Messages from './pages/Messages';
import MessageThread from './pages/MessageThread';
import MyShowcases from './pages/MyShowcases';
import UserShowcases from './pages/UserShowcases';
import ProfileFollowers from './pages/ProfileFollowers';
import ProfileFollowing from './pages/ProfileFollowing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Community from './pages/Community';
import AffiliateApply from './pages/AffiliateApply';
import AffiliateDashboard from './pages/AffiliateDashboard';
import AdminAffiliates from './pages/AdminAffiliates';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <div className="app-layout">
            <Routes>
              <Route path="/" element={<Gallery />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/search" element={<Search />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/google/callback" element={<GoogleCallback />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:sessionId" element={<Chat />} />
              <Route path="/character/:type/:characterId" element={<CharacterDetail />} />
              <Route path="/purchase-tokens" element={<PurchaseTokens />} />
              <Route path="/admin/upload-template" element={<AdminTemplateUpload />} />
              <Route path="/admin/edit/:type/:characterId" element={<EditCharacter />} />
              <Route path="/profile/:username" element={<Profile />} />
              <Route path="/profile/:username/showcases" element={<UserShowcases />} />
              <Route path="/profile/:username/followers" element={<ProfileFollowers />} />
              <Route path="/profile/:username/following" element={<ProfileFollowing />} />
              <Route path="/settings/profile" element={<ProfileSettings />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/upload-character" element={<UploadCharacter />} />
              <Route path="/my-uploads" element={<MyUploads />} />
              <Route path="/admin/moderation" element={<ModerationDashboard />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:threadId" element={<MessageThread />} />
              <Route path="/my-showcases" element={<MyShowcases />} />
              <Route path="/community" element={<Community />} />
              <Route path="/community/chats/:sessionId" element={<Community />} />
              <Route path="/affiliate/apply" element={<AffiliateApply />} />
              <Route path="/affiliate/dashboard" element={<AffiliateDashboard />} />
              <Route path="/admin/affiliates" element={<AdminAffiliates />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
