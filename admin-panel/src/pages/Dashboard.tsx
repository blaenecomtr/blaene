export default function Dashboard() {
  return (
    <div>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#fff' }}>Dashboard</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px'
      }}>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>Toplam Ürün</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>-</div>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>Toplam Sipariş</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>-</div>
        </div>
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '5px' }}>Aktif Kullanıcı</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>-</div>
        </div>
      </div>
    </div>
  )
}
