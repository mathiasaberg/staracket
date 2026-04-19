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
  params.set('apikey', process.env.EVERYSPORT_API_KEY || '')

  try {
    const upstream = await fetch(`https://api.everysport.com/v1/${path}?${params}`)
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Everysport svarade ${upstream.status}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
