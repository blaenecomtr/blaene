import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useAuthStore } from './store/auth';
import { useAdminStore } from './store/admin';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
export default function App() {
    const { isAuthenticated, checkAuth } = useAuthStore();
    const { initializeData } = useAdminStore();
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const init = async () => {
            const isAuth = await checkAuth();
            if (isAuth) {
                await initializeData();
            }
            setLoading(false);
        };
        init();
    }, []);
    if (loading) {
        return (_jsx("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }, children: _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("div", { style: {
                            display: 'inline-block',
                            width: '30px',
                            height: '30px',
                            border: '3px solid #334155',
                            borderTopColor: '#3b82f6',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite'
                        } }), _jsx("p", { style: { marginTop: '15px', color: '#94a3b8' }, children: "Y\u00FCkleniyor..." }), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg); } }` })] }) }));
    }
    return isAuthenticated ? _jsx(DashboardLayout, {}) : _jsx(LoginPage, {});
}
