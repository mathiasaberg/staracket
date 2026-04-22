import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const pathSegments = req.query.path as string[]
  const path = pathSegments.join('/')

  const params = new URLSearchParams()
  Object.entries(req.query).forEach(([k, v]) => {
    if (k === 'path') return
    if (Array.isArray(v)) v.forEach(val => params.append(k, val))
    else if (v) params.append(k, v)
  })

  const apiKey = process.env.APIFOOTBALL_API_KEY || ''
  if (!apiKey) {
    return res.status(500).json({ error: 'APIFOOTBALL_API_KEY not configured' })
  }

  try {
    const url = `https://v3.football.api-sports.io/${path}${params.toString() ? '?' + params : ''}`
    const upstream = await fetch(url, {
      headers: { 'x-apisports-key': apiKey }
    })
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `API-Football returned ${upstream.status}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
