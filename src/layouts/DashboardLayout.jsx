import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

export default function DashboardLayout({ user, setUser }) {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="content-wrapper">
        <Topbar user={user} setUser={setUser} />
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
