import { useEffect, useState } from 'react'
import { fetchCrmOverview } from '../services/api'

const FILTERS = ['ALL', 'HOT', 'WARM', 'COLD']

function CrmDashboard({ refreshKey = 0 }) {
  const [data, setData] = useState({
    summary: { totalLeads: 0, hot: 0, warm: 0, cold: 0, appointments: 0, handoffs: 0 },
    leads: [],
  })
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadOverview = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetchCrmOverview()
      setData({
        summary: res.summary || {
          totalLeads: 0,
          hot: 0,
          warm: 0,
          cold: 0,
          appointments: 0,
          handoffs: 0,
        },
        leads: res.leads || [],
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load CRM data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    fetchCrmOverview()
      .then((res) => {
        if (!active) return
        setError('')
        setData({
          summary: res.summary || {
            totalLeads: 0,
            hot: 0,
            warm: 0,
            cold: 0,
            appointments: 0,
            handoffs: 0,
          },
          leads: res.leads || [],
        })
      })
      .catch((err) => {
        if (!active) return
        setError(err.response?.data?.error || 'Could not load CRM data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshKey])

  const filteredLeads =
    filter === 'ALL'
      ? data.leads
      : data.leads.filter((lead) => lead.score === filter)

  return (
    <section id="crm-dashboard" className="crm-section">
      <div className="crm-header">
        <div>
          <h2>Lead Qualification &amp; CRM</h2>
          <p>Automatically scored from live voice conversations</p>
        </div>
        <button type="button" className="secondary-btn" onClick={loadOverview}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="crm-stats">
        <div className="stat-card">
          <span className="stat-label">Total Leads</span>
          <strong className="stat-value">{data.summary.totalLeads}</strong>
        </div>
        <div className="stat-card stat-hot">
          <span className="stat-label">HOT</span>
          <strong className="stat-value">{data.summary.hot}</strong>
        </div>
        <div className="stat-card stat-warm">
          <span className="stat-label">WARM</span>
          <strong className="stat-value">{data.summary.warm}</strong>
        </div>
        <div className="stat-card stat-cold">
          <span className="stat-label">COLD</span>
          <strong className="stat-value">{data.summary.cold}</strong>
        </div>
      </div>

      <div className="crm-filters">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={`filter-pill ${filter === item ? 'active' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {error && <p className="crm-empty">{error}</p>}

      {!error && !loading && filteredLeads.length === 0 && (
        <p className="crm-empty">
          No {filter === 'ALL' ? '' : `${filter} `}leads recorded yet. Start a
          voice conversation to qualify leads.
        </p>
      )}

      {filteredLeads.length > 0 && (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Score</th>
                <th>Interest</th>
                <th>Budget</th>
                <th>Timeline</th>
                <th>Latest Note</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.leadId}>
                  <td>
                    <div className="lead-name">{lead.customerName}</div>
                    {lead.phone && <div className="lead-sub">{lead.phone}</div>}
                  </td>
                  <td>
                    <span className={`score-badge score-${lead.score.toLowerCase()}`}>
                      {lead.score}
                    </span>
                  </td>
                  <td>
                    {[lead.brand, lead.category].filter(Boolean).join(' · ') || 'General'}
                  </td>
                  <td>
                    {lead.budget ? `₹${Number(lead.budget).toLocaleString()}` : '—'}
                  </td>
                  <td>{lead.timeline || 'Unspecified'}</td>
                  <td className="lead-note">{lead.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default CrmDashboard
