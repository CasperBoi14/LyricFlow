import type { FastifyPluginAsync } from 'fastify'
import { BadRequestError } from '../lib/errors.js'
import { getLyrics, searchLyrics, type LyricsGetParams } from '../services/lyrics.service.js'

type SearchLyricsQuery = {
  q?: string
}

type GetLyricsQuery = {
  id?: string
  artist_name?: string
  track_name?: string
  album_name?: string
  duration?: string
}

export const lyricsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: SearchLyricsQuery }>(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', maxLength: 300 },
          },
        },
      },
    },
    async (request) => {
      const query = (request.query.q ?? '').trim()
      if (!query) throw new BadRequestError('Missing query')
      return searchLyrics(query)
    },
  )

  app.get<{ Querystring: GetLyricsQuery }>(
    '/get',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^\\d{1,20}$' },
            artist_name: { type: 'string', maxLength: 300 },
            track_name: { type: 'string', maxLength: 300 },
            album_name: { type: 'string', maxLength: 300 },
            duration: { type: 'string', pattern: '^\\d+$' },
          },
        },
      },
    },
    async (request) => {
      const params: LyricsGetParams = {}

      const id = request.query.id?.trim()
      if (id) params.id = id
      const artistName = request.query.artist_name?.trim()
      if (artistName) params.artist_name = artistName
      const trackName = request.query.track_name?.trim()
      if (trackName) params.track_name = trackName
      const albumName = request.query.album_name?.trim()
      if (albumName) params.album_name = albumName
      const duration = request.query.duration
      if (duration !== undefined) params.duration = Number(duration)

      return getLyrics(params)
    },
  )
}
