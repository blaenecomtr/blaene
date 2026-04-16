import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function Sidebar({ currentPage, onNavigate }) {
    const menuItems = [
        { id: 'dashboard', label: '📊 Dashboard' },
        { id: 'products', label: '📦 Ürünler' },
        { id: 'orders', label: '📋 Siparişler' },
        { id: 'users', label: '👥 Kullanıcılar' },
    ];
    return (_jsxs("aside", { style: {
            width: '260px',
            background: '#1e293b',
            borderRight: '1px solid #334155',
            padding: '20px',
            overflowY: 'auto',
            position: 'fixed',
            height: '100vh',
            left: 0,
            top: 0
        }, children: [_jsx("div", { style: {
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#fff',
                    marginBottom: '30px'
                }, children: "Blaene Admin" }), _jsx("nav", { style: { display: 'flex', flexDirection: 'column', gap: '5px' }, children: menuItems.map(item => (_jsx("button", { onClick: () => onNavigate(item.id), style: {
                        padding: '10px 12px',
                        color: currentPage === item.id ? '#fff' : '#cbd5e1',
                        background: currentPage === item.id ? '#3b82f6' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        textAlign: 'left',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }, children: item.label }, item.id))) })] }));
}
