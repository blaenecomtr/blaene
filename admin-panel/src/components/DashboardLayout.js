import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAdminStore } from '../store/admin';
import Sidebar from './Sidebar';
import Header from './Header';
import Dashboard from '../pages/Dashboard';
import Products from '../pages/Products';
import Orders from '../pages/Orders';
import Users from '../pages/Users';
import LogoutModal from './LogoutModal';
export default function DashboardLayout() {
    const { currentPage, setCurrentPage } = useAdminStore();
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return _jsx(Dashboard, {});
            case 'products':
                return _jsx(Products, {});
            case 'orders':
                return _jsx(Orders, {});
            case 'users':
                return _jsx(Users, {});
            default:
                return _jsx(Dashboard, {});
        }
    };
    return (_jsxs("div", { style: { display: 'flex', height: '100vh' }, children: [_jsx(Sidebar, { currentPage: currentPage, onNavigate: setCurrentPage }), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' }, children: [_jsx(Header, { onLogoutClick: () => setShowLogoutModal(true) }), _jsx("div", { style: { flex: 1, overflowY: 'auto', padding: '30px' }, children: renderPage() })] }), _jsx(LogoutModal, { isOpen: showLogoutModal, onClose: () => setShowLogoutModal(false) })] }));
}
