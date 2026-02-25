'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { OfficeState } from '@/lib/pixel-office/engine/officeState'
import { renderFrame } from '@/lib/pixel-office/engine/renderer'
import type { EditorRenderState } from '@/lib/pixel-office/engine/renderer'
import type { ContributionData } from '@/lib/pixel-office/engine/renderer'
import { syncAgentsToOffice, AgentActivity } from '@/lib/pixel-office/agentBridge'
import { EditorState } from '@/lib/pixel-office/editor/editorState'
import {
  paintTile, placeFurniture, removeFurniture, moveFurniture,
  rotateFurniture, toggleFurnitureState, canPlaceFurniture,
  expandLayout, getWallPlacementRow,
} from '@/lib/pixel-office/editor/editorActions'
import type { ExpandDirection } from '@/lib/pixel-office/editor/editorActions'
import { TILE_SIZE, ZOOM_MIN, ZOOM_MAX } from '@/lib/pixel-office/constants'
import { TileType, EditTool } from '@/lib/pixel-office/types'
import type { TileType as TileTypeVal, FloorColor, OfficeLayout } from '@/lib/pixel-office/types'
import { getCatalogEntry, isRotatable } from '@/lib/pixel-office/layout/furnitureCatalog'
import { createDefaultLayout, serializeLayout } from '@/lib/pixel-office/layout/layoutSerializer'
import { playDoneSound, unlockAudio, setSoundEnabled, isSoundEnabled } from '@/lib/pixel-office/notificationSound'
import { loadCharacterPNGs, loadWallPNG } from '@/lib/pixel-office/sprites/pngLoader'
import { useI18n } from '@/lib/i18n'
import { EditorToolbar } from './components/EditorToolbar'
import { EditActionBar } from './components/EditActionBar'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function formatMs(ms: number): string {
  if (!ms) return '-'
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

function MiniSparkline({ data, width = 120, height = 24, color: fixedColor }: { data: number[]; width?: number; height?: number; color?: string }) {
  const hasData = data.some(v => v > 0)
  if (!hasData) return null
  const validValues = data.filter(v => v > 0)
  let trending: 'up' | 'down' | 'flat' = 'flat'
  if (validValues.length >= 2) {
    const last = validValues[validValues.length - 1]
    const prev = validValues[validValues.length - 2]
    trending = last > prev ? 'up' : last < prev ? 'down' : 'flat'
  }
  const color = fixedColor || (trending === 'up' ? '#f87171' : trending === 'down' ? '#4ade80' : '#f59e0b')
  const max = Math.max(...data)
  const min = Math.min(...data.filter(v => v > 0), max)
  const range = max - min || 1
  const pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = v === 0 ? height - pad : (height - pad) - ((v - min) / range) * (height - pad * 2 - 2)
    return { x, y, v }
  })
  const line = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = `${pts[0].x},${height} ${line} ${pts[pts.length - 1].x},${height}`
  const id = `spark-${Math.random().toString(36).slice(2, 8)}`
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.filter(p => p.v > 0).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} opacity={0.9} />
      ))}
    </svg>
  )
}

/** Convert mouse event to tile coordinates */
function mouseToTile(
  e: React.MouseEvent, canvas: HTMLCanvasElement, office: OfficeState, zoom: number, pan: { x: number; y: number }
): { col: number; row: number; worldX: number; worldY: number } {
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const cols = office.layout.cols
  const rows = office.layout.rows
  const mapW = cols * TILE_SIZE * zoom
  const mapH = rows * TILE_SIZE * zoom
  const offsetX = (rect.width - mapW) / 2 + pan.x
  const offsetY = (rect.height - mapH) / 2 + pan.y
  const worldX = (x - offsetX) / zoom
  const worldY = (y - offsetY) / zoom
  const col = Math.floor(worldX / TILE_SIZE)
  const row = Math.floor(worldY / TILE_SIZE)
  return { col, row, worldX, worldY }
}

/** Detect ghost border tile (expansion zone) */
function getGhostBorderDirection(col: number, row: number, cols: number, rows: number): ExpandDirection | null {
  if (row === -1) return 'up'
  if (row === rows) return 'down'
  if (col === -1) return 'left'
  if (col === cols) return 'right'
  return null
}

export default function PixelOfficePage() {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const officeRef = useRef<OfficeState | null>(null)
  const editorRef = useRef<EditorState>(new EditorState())
  const agentIdMapRef = useRef<Map<string, number>>(new Map())
  const nextIdRef = useRef<{ current: number }>({ current: 1 })
  const zoomRef = useRef<number>(0) // 0 = auto-fit on first render
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const savedLayoutRef = useRef<OfficeLayout | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)
  const prevAgentStatesRef = useRef<Map<string, string>>(new Map())

  const [agents, setAgents] = useState<AgentActivity[]>([])
  const [hoveredAgentId, setHoveredAgentId] = useState<number | null>(null)
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const agentStatsRef = useRef<Map<string, { sessionCount: number; messageCount: number; totalTokens: number; todayAvgResponseMs: number; weeklyResponseMs: number[]; weeklyTokens: number[]; lastActive: number | null }>>(new Map())
  const contributionsRef = useRef<ContributionData | null>(null)
  const photographRef = useRef<HTMLImageElement | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [editorTick, setEditorTick] = useState(0)
  const [officeReady, setOfficeReady] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [fullscreenPhoto, setFullscreenPhoto] = useState(false)

  const forceEditorUpdate = useCallback(() => setEditorTick(t => t + 1), [])

  // Load saved layout and sound preference
  useEffect(() => {
    const loadLayout = async () => {
      try {
        const res = await fetch('/api/pixel-office/layout')
        const data = await res.json()
        if (data.layout) {
          officeRef.current = new OfficeState(data.layout)
          savedLayoutRef.current = data.layout
        } else {
          officeRef.current = new OfficeState()
        }
      } catch {
        officeRef.current = new OfficeState()
      }
      await Promise.all([loadCharacterPNGs(), loadWallPNG()])
      setOfficeReady(true)
    }
    loadLayout()

    const savedSound = localStorage.getItem('pixel-office-sound')
    if (savedSound !== null) {
      const enabled = savedSound !== 'false'
      setSoundOn(enabled)
      setSoundEnabled(enabled)
    }

    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [])

  // Game loop
  useEffect(() => {
    if (!canvasRef.current || !officeRef.current || !containerRef.current) return
    const canvas = canvasRef.current
    const office = officeRef.current
    const container = containerRef.current
    const editor = editorRef.current
    let lastTime = 0

    const render = (time: number) => {
      const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time
      office.update(dt)

      const width = container.clientWidth
      const height = container.clientHeight

      // Auto-fit zoom on first render
      if (zoomRef.current === 0) {
        const mapW = office.layout.cols * TILE_SIZE
        const mapH = office.layout.rows * TILE_SIZE
        const fitZoom = Math.floor(Math.min(width / mapW, height / mapH) * 2) / 2
        zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom))
      }
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingEnabled = false
        ctx.scale(dpr, dpr)

        let editorRender: EditorRenderState | undefined
        if (editor.isEditMode) {
          const sel = editor.selectedFurnitureUid
          const selItem = sel ? office.layout.furniture.find(f => f.uid === sel) : null
          const selEntry = selItem ? getCatalogEntry(selItem.type) : null
          const ghostEntry = (editor.activeTool === EditTool.FURNITURE_PLACE)
            ? getCatalogEntry(editor.selectedFurnitureType) : null
          const showGhostBorder = editor.activeTool === EditTool.TILE_PAINT ||
            editor.activeTool === EditTool.WALL_PAINT || editor.activeTool === EditTool.ERASE

          editorRender = {
            showGrid: true,
            ghostSprite: ghostEntry?.sprite ?? null,
            ghostCol: editor.ghostCol,
            ghostRow: editor.ghostRow,
            ghostValid: editor.ghostValid,
            selectedCol: selItem?.col ?? 0,
            selectedRow: selItem?.row ?? 0,
            selectedW: selEntry?.footprintW ?? 0,
            selectedH: selEntry?.footprintH ?? 0,
            hasSelection: !!selItem,
            isRotatable: selItem ? isRotatable(selItem.type) : false,
            deleteButtonBounds: null,
            rotateButtonBounds: null,
            showGhostBorder,
            ghostBorderHoverCol: editor.ghostCol,
            ghostBorderHoverRow: editor.ghostRow,
          }
        }

        renderFrame(ctx, width, height, office.tileMap, office.furniture, office.getCharacters(),
          zoomRef.current, panRef.current.x, panRef.current.y,
          { selectedAgentId: null, hoveredAgentId, hoveredTile: null, seats: office.seats, characters: office.characters },
          editorRender, office.layout.tileColors, office.layout.cols, office.layout.rows,
          contributionsRef.current ?? undefined, photographRef.current ?? undefined)
      }
      animationFrameIdRef.current = requestAnimationFrame(render)
    }
    animationFrameIdRef.current = requestAnimationFrame(render)
    return () => {
      if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current)
    }
  }, [hoveredAgentId, editorTick, officeReady])

  // Load GitHub contribution heatmap data (real → fallback mock)
  useEffect(() => {
    // 先设置 mock 保证立即有内容
    const mockWeeks = Array.from({ length: 52 }, () => ({
      days: Array.from({ length: 7 }, () => ({
        count: Math.random() < 0.25 ? 0 : Math.floor(Math.random() * 12),
        date: '',
      })),
    }))
    contributionsRef.current = { weeks: mockWeeks, username: 'mock' }

    // 异步拉取真实数据
    fetch('/api/pixel-office/contributions')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.weeks) {
          contributionsRef.current = data
        }
      })
      .catch(() => {})
  }, [])

  // Load photograph for right room wall
  useEffect(() => {
    const img = new Image()
    img.src = '/assets/pixel-office/photograph.webp'
    img.onload = () => { photographRef.current = img }
  }, [])

  // Poll for agent activity + sound notification
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/agent-activity')
        const data = await res.json()
        const newAgents: AgentActivity[] = data.agents || []
        setAgents(newAgents)

        if (officeRef.current) {
          syncAgentsToOffice(newAgents, officeRef.current, agentIdMapRef.current, nextIdRef.current)
        }

        // Play sound when agent transitions to waiting
        for (const agent of newAgents) {
          const prev = prevAgentStatesRef.current.get(agent.agentId)
          if (agent.state === 'waiting' && prev && prev !== 'waiting') {
            playDoneSound()
          }
        }
        const stateMap = new Map<string, string>()
        for (const a of newAgents) stateMap.set(a.agentId, a.state)
        prevAgentStatesRef.current = stateMap
      } catch (e) {
        console.error('Failed to fetch agents:', e)
      }
    }
    fetchAgents()
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [])

  // Poll agent session stats from /api/config
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/config')
        const data = await res.json()
        const map = new Map<string, { sessionCount: number; messageCount: number; totalTokens: number; todayAvgResponseMs: number; weeklyResponseMs: number[]; weeklyTokens: number[]; lastActive: number | null }>()
        for (const agent of (data.agents || [])) {
          if (agent.session) {
            map.set(agent.id, {
              sessionCount: agent.session.sessionCount || 0,
              messageCount: agent.session.messageCount || 0,
              totalTokens: agent.session.totalTokens || 0,
              todayAvgResponseMs: agent.session.todayAvgResponseMs || 0,
              weeklyResponseMs: agent.session.weeklyResponseMs || [],
              weeklyTokens: agent.session.weeklyTokens || [],
              lastActive: agent.session.lastActive || null,
            })
          }
        }
        agentStatsRef.current = map
      } catch {}
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── Editor helpers ──────────────────────────────────────────
  const applyEdit = useCallback((newLayout: OfficeLayout) => {
    const office = officeRef.current
    const editor = editorRef.current
    if (!office) return
    if (newLayout === office.layout) return
    editor.pushUndo(office.layout)
    editor.clearRedo()
    editor.isDirty = true
    office.rebuildFromLayout(newLayout)
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleUndo = useCallback(() => {
    const office = officeRef.current
    const editor = editorRef.current
    if (!office) return
    const prev = editor.popUndo()
    if (!prev) return
    editor.pushRedo(office.layout)
    office.rebuildFromLayout(prev)
    editor.isDirty = true
    editor.clearSelection()
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleRedo = useCallback(() => {
    const office = officeRef.current
    const editor = editorRef.current
    if (!office) return
    const next = editor.popRedo()
    if (!next) return
    editor.pushUndo(office.layout)
    office.rebuildFromLayout(next)
    editor.isDirty = true
    editor.clearSelection()
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleSave = useCallback(async () => {
    const office = officeRef.current
    const editor = editorRef.current
    if (!office) return
    try {
      await fetch('/api/pixel-office/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeLayout(office.layout),
      })
      savedLayoutRef.current = office.layout
      editor.isDirty = false
      forceEditorUpdate()
    } catch (e) {
      console.error('Failed to save layout:', e)
    }
  }, [forceEditorUpdate])

  const handleReset = useCallback(() => {
    const office = officeRef.current
    const editor = editorRef.current
    if (!office) return
    const defaultLayout = savedLayoutRef.current || createDefaultLayout()
    editor.pushUndo(office.layout)
    editor.clearRedo()
    office.rebuildFromLayout(defaultLayout)
    editor.isDirty = false
    editor.clearSelection()
    forceEditorUpdate()
  }, [forceEditorUpdate])

  // ── Mouse events ──────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.5 : 0.5
    zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current + delta))
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || !officeRef.current) return
    const office = officeRef.current
    const editor = editorRef.current
    const rect = canvasRef.current.getBoundingClientRect()
    mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const { col, row, worldX, worldY } = mouseToTile(e, canvasRef.current, office, zoomRef.current, panRef.current)

    if (editor.isEditMode) {
      // Update ghost preview
      if (editor.activeTool === EditTool.FURNITURE_PLACE) {
        const entry = getCatalogEntry(editor.selectedFurnitureType)
        if (entry) {
          const placementRow = entry.canPlaceOnWalls ? getWallPlacementRow(editor.selectedFurnitureType, row) : row
          editor.ghostCol = col
          editor.ghostRow = placementRow
          editor.ghostValid = canPlaceFurniture(office.layout, editor.selectedFurnitureType, col, placementRow)
        }
      } else if (editor.activeTool === EditTool.TILE_PAINT || editor.activeTool === EditTool.WALL_PAINT || editor.activeTool === EditTool.ERASE) {
        editor.ghostCol = col
        editor.ghostRow = row
        // Drag painting
        if (editor.isDragging && col >= 0 && col < office.layout.cols && row >= 0 && row < office.layout.rows) {
          if (editor.activeTool === EditTool.TILE_PAINT) {
            applyEdit(paintTile(office.layout, col, row, editor.selectedTileType, editor.floorColor))
          } else if (editor.activeTool === EditTool.WALL_PAINT) {
            const currentTile = office.layout.tiles[row * office.layout.cols + col]
            if (editor.wallDragAdding === null) {
              editor.wallDragAdding = currentTile !== TileType.WALL
            }
            if (editor.wallDragAdding && currentTile !== TileType.WALL) {
              applyEdit(paintTile(office.layout, col, row, TileType.WALL, editor.wallColor))
            } else if (!editor.wallDragAdding && currentTile === TileType.WALL) {
              applyEdit(paintTile(office.layout, col, row, TileType.FLOOR_1, editor.floorColor))
            }
          } else if (editor.activeTool === EditTool.ERASE) {
            applyEdit(paintTile(office.layout, col, row, TileType.VOID as TileTypeVal))
          }
        }
      } else {
        editor.ghostCol = col
        editor.ghostRow = row
      }

      // Drag-to-move furniture
      if (editor.dragUid) {
        const dx = col - editor.dragStartCol
        const dy = row - editor.dragStartRow
        if (!editor.isDragMoving && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
          editor.isDragMoving = true
        }
        if (editor.isDragMoving) {
          const newCol = col - editor.dragOffsetCol
          const newRow = row - editor.dragOffsetRow
          const newLayout = moveFurniture(office.layout, editor.dragUid, newCol, newRow)
          if (newLayout !== office.layout) {
            office.rebuildFromLayout(newLayout)
            editor.isDirty = true
          }
        }
      }
    } else {
      // Normal mode: hover detection
      const id = office.getCharacterAt(worldX, worldY)
      setHoveredAgentId(id)
      // Pointer cursor on camera furniture
      const tileX = worldX / TILE_SIZE
      const tileY = worldY / TILE_SIZE
      const onCamera = office.layout.furniture.some(f => {
        if (f.type !== 'camera') return false
        const entry = getCatalogEntry(f.type)
        if (!entry) return false
        return tileX >= f.col && tileX < f.col + entry.footprintW &&
               tileY >= f.row && tileY < f.row + entry.footprintH
      })
      const onPhoto = photographRef.current && tileX >= 10 && tileX < 17 && tileY >= -0.5 && tileY < 1
      if (canvasRef.current) canvasRef.current.style.cursor = (onCamera || id !== null || onPhoto) ? 'pointer' : 'default'
    }
  }

  const PHOTO_COUNT = 13
  const handleMouseDown = (e: React.MouseEvent) => {
    unlockAudio()
    if (!canvasRef.current || !officeRef.current) return
    const office = officeRef.current
    const editor = editorRef.current
    if (!editor.isEditMode) {
      // Non-edit mode: check camera click or character click
      if (e.button === 0) {
        const { worldX, worldY } = mouseToTile(e, canvasRef.current, office, zoomRef.current, panRef.current)
        const tileX = worldX / TILE_SIZE
        const tileY = worldY / TILE_SIZE
        const clickedCamera = office.layout.furniture.find(f => {
          if (f.type !== 'camera') return false
          const entry = getCatalogEntry(f.type)
          if (!entry) return false
          return tileX >= f.col && tileX < f.col + entry.footprintW &&
                 tileY >= f.row && tileY < f.row + entry.footprintH
        })
        if (clickedCamera) {
          const idx = Math.floor(Math.random() * PHOTO_COUNT) + 1
          const img = new Image()
          img.src = `/assets/pixel-office/my-photographic-works/${idx}.webp`
          img.onload = () => { photographRef.current = img }
        } else if (photographRef.current && tileX >= 10 && tileX < 17 && tileY >= -0.5 && tileY < 1) {
          // Click on wall photograph — fullscreen view
          setFullscreenPhoto(true)
        } else {
          // Check character click
          const charId = office.getCharacterAt(worldX, worldY)
          if (charId !== null) {
            const map = agentIdMapRef.current
            for (const [aid, cid] of map.entries()) {
              if (cid === charId) { setSelectedAgentId(aid); break }
            }
          } else {
            setSelectedAgentId(null)
          }
        }
      }
      return
    }
    const { col, row } = mouseToTile(e, canvasRef.current, office, zoomRef.current, panRef.current)

    if (e.button === 0) {
      // Left click
      const tool = editor.activeTool
      if (tool === EditTool.TILE_PAINT || tool === EditTool.WALL_PAINT || tool === EditTool.ERASE) {
        editor.isDragging = true
        editor.wallDragAdding = null

        // Check ghost border expansion
        const dir = getGhostBorderDirection(col, row, office.layout.cols, office.layout.rows)
        if (dir) {
          const result = expandLayout(office.layout, dir)
          if (result) {
            applyEdit(result.layout)
            office.rebuildFromLayout(result.layout, result.shift)
          }
          return
        }

        if (col >= 0 && col < office.layout.cols && row >= 0 && row < office.layout.rows) {
          if (tool === EditTool.TILE_PAINT) {
            applyEdit(paintTile(office.layout, col, row, editor.selectedTileType, editor.floorColor))
          } else if (tool === EditTool.WALL_PAINT) {
            const currentTile = office.layout.tiles[row * office.layout.cols + col]
            editor.wallDragAdding = currentTile !== TileType.WALL
            if (editor.wallDragAdding) {
              applyEdit(paintTile(office.layout, col, row, TileType.WALL, editor.wallColor))
            } else {
              applyEdit(paintTile(office.layout, col, row, TileType.FLOOR_1, editor.floorColor))
            }
          } else if (tool === EditTool.ERASE) {
            applyEdit(paintTile(office.layout, col, row, TileType.VOID as TileTypeVal))
          }
        }
      } else if (tool === EditTool.FURNITURE_PLACE) {
        if (editor.ghostValid && col >= 0) {
          const entry = getCatalogEntry(editor.selectedFurnitureType)
          if (entry) {
            const placementRow = entry.canPlaceOnWalls ? getWallPlacementRow(editor.selectedFurnitureType, row) : row
            const uid = `furn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            const item = {
              uid, type: editor.selectedFurnitureType, col, row: placementRow,
              ...(editor.pickedFurnitureColor ? { color: editor.pickedFurnitureColor } : {}),
            }
            applyEdit(placeFurniture(office.layout, item))
          }
        }
      } else if (tool === EditTool.SELECT) {
        // Check if clicking on placed furniture
        const clickedItem = office.layout.furniture.find(f => {
          const entry = getCatalogEntry(f.type)
          if (!entry) return false
          return col >= f.col && col < f.col + entry.footprintW && row >= f.row && row < f.row + entry.footprintH
        })
        if (clickedItem) {
          editor.selectedFurnitureUid = clickedItem.uid
          editor.startDrag(clickedItem.uid, col, row, col - clickedItem.col, row - clickedItem.row)
        } else {
          editor.clearSelection()
        }
        forceEditorUpdate()
      } else if (tool === EditTool.EYEDROPPER) {
        if (col >= 0 && col < office.layout.cols && row >= 0 && row < office.layout.rows) {
          const idx = row * office.layout.cols + col
          const tile = office.layout.tiles[idx]
          if (tile !== TileType.WALL && tile !== TileType.VOID) {
            editor.selectedTileType = tile
            const color = office.layout.tileColors?.[idx]
            if (color) editor.floorColor = { ...color }
          } else if (tile === TileType.WALL) {
            const color = office.layout.tileColors?.[idx]
            if (color) editor.wallColor = { ...color }
            editor.activeTool = EditTool.WALL_PAINT
          }
          editor.activeTool = editor.activeTool === EditTool.EYEDROPPER ? EditTool.TILE_PAINT : editor.activeTool
          forceEditorUpdate()
        }
      } else if (tool === EditTool.FURNITURE_PICK) {
        const pickedItem = office.layout.furniture.find(f => {
          const entry = getCatalogEntry(f.type)
          if (!entry) return false
          return col >= f.col && col < f.col + entry.footprintW && row >= f.row && row < f.row + entry.footprintH
        })
        if (pickedItem) {
          editor.selectedFurnitureType = pickedItem.type
          editor.pickedFurnitureColor = pickedItem.color ? { ...pickedItem.color } : null
          editor.activeTool = EditTool.FURNITURE_PLACE
          forceEditorUpdate()
        }
      }
    }
  }

  const handleMouseUp = () => {
    const editor = editorRef.current
    if (editor.isDragging) {
      editor.isDragging = false
      editor.wallDragAdding = null
    }
    if (editor.dragUid) {
      if (editor.isDragMoving) {
        // Commit the drag move to undo stack
        editor.isDirty = true
        forceEditorUpdate()
      }
      editor.clearDrag()
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    const editor = editorRef.current
    if (!editor.isEditMode) return
    e.preventDefault()
    if (!canvasRef.current || !officeRef.current) return
    const office = officeRef.current
    const { col, row } = mouseToTile(e, canvasRef.current, office, zoomRef.current, panRef.current)
    if (col >= 0 && col < office.layout.cols && row >= 0 && row < office.layout.rows) {
      applyEdit(paintTile(office.layout, col, row, TileType.VOID as TileTypeVal))
    }
  }

  // ── Keyboard events ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const editor = editorRef.current
      const office = officeRef.current
      if (!editor.isEditMode || !office) return

      if (e.key === 'r' || e.key === 'R') {
        if (editor.selectedFurnitureUid) {
          applyEdit(rotateFurniture(office.layout, editor.selectedFurnitureUid, e.shiftKey ? 'ccw' : 'cw'))
        }
      } else if (e.key === 't' || e.key === 'T') {
        if (editor.selectedFurnitureUid) {
          applyEdit(toggleFurnitureState(office.layout, editor.selectedFurnitureUid))
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault()
        handleRedo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editor.selectedFurnitureUid) {
          applyEdit(removeFurniture(office.layout, editor.selectedFurnitureUid))
          editor.clearSelection()
          forceEditorUpdate()
        }
      } else if (e.key === 'Escape') {
        // Multi-stage escape
        if (editor.activeTool === EditTool.FURNITURE_PICK) {
          editor.activeTool = EditTool.FURNITURE_PLACE
        } else if (editor.selectedFurnitureUid) {
          editor.clearSelection()
        } else if (editor.activeTool !== EditTool.SELECT) {
          editor.activeTool = EditTool.SELECT
        } else {
          editor.isEditMode = false
          setIsEditMode(false)
        }
        forceEditorUpdate()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyEdit, handleUndo, handleRedo, forceEditorUpdate])

  // ── Editor toolbar callbacks ──────────────────────────────────
  const handleToolChange = useCallback((tool: EditTool) => {
    editorRef.current.activeTool = tool
    editorRef.current.clearSelection()
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleTileTypeChange = useCallback((type: TileTypeVal) => {
    editorRef.current.selectedTileType = type
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleFloorColorChange = useCallback((color: FloorColor) => {
    editorRef.current.floorColor = color
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleWallColorChange = useCallback((color: FloorColor) => {
    editorRef.current.wallColor = color
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleFurnitureTypeChange = useCallback((type: string) => {
    editorRef.current.selectedFurnitureType = type
    forceEditorUpdate()
  }, [forceEditorUpdate])

  const handleSelectedFurnitureColorChange = useCallback((color: FloorColor | null) => {
    const editor = editorRef.current
    const office = officeRef.current
    if (!office || !editor.selectedFurnitureUid) return
    const newLayout = {
      ...office.layout,
      furniture: office.layout.furniture.map(f =>
        f.uid === editor.selectedFurnitureUid ? { ...f, color: color ?? undefined } : f
      ),
    }
    applyEdit(newLayout)
  }, [applyEdit])

  const toggleEditMode = useCallback(() => {
    const editor = editorRef.current
    editor.isEditMode = !editor.isEditMode
    if (!editor.isEditMode) {
      editor.reset()
    }
    setIsEditMode(editor.isEditMode)
  }, [])

  const toggleSound = useCallback(() => {
    const newVal = !isSoundEnabled()
    setSoundEnabled(newVal)
    setSoundOn(newVal)
    localStorage.setItem('pixel-office-sound', String(newVal))
  }, [])

  const resetView = useCallback(() => {
    zoomRef.current = 0 // triggers auto-fit on next frame
    panRef.current = { x: 0, y: 0 }
  }, [])

  // ── Hovered agent tooltip data ──────────────────────────────
  const getHoveredAgentInfo = useCallback(() => {
    if (hoveredAgentId === null) return null
    const map = agentIdMapRef.current
    let agentId: string | null = null
    for (const [aid, cid] of map.entries()) {
      if (cid === hoveredAgentId) { agentId = aid; break }
    }
    if (!agentId) return null
    const agent = agents.find(a => a.agentId === agentId)
    const stats = agentStatsRef.current.get(agentId)
    return { agent, stats }
  }, [hoveredAgentId, agents])

  const hoveredInfo = getHoveredAgentInfo()

  const editor = editorRef.current
  const selectedItem = editor.selectedFurnitureUid
    ? officeRef.current?.layout.furniture.find(f => f.uid === editor.selectedFurnitureUid) : null

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: agent tags + controls */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-[var(--border)]">
        <span className="text-sm font-bold text-[var(--text)] mr-2">{t('pixelOffice.title')}</span>
        <div className="flex flex-wrap gap-2 flex-1">
          {agents.map(agent => (
            <div key={agent.agentId} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
              agent.state === 'working' ? 'bg-green-500/10 border-green-500/30 text-green-500 animate-pulse' :
              agent.state === 'idle' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 animate-pulse' :
              'bg-slate-600/20 border-slate-500/40 text-slate-300'
            }`}
              {...(agent.state === 'working' ? { style: { animationDuration: '1.3s' } } : {})}
            >
              <span>{agent.emoji}</span>
              <span className="text-sm">{agent.name}</span>
              {agent.state === 'working' && <span className="text-[10px] uppercase tracking-wider opacity-70">{t('pixelOffice.state.working')}</span>}
              {agent.state === 'idle' && <span className="text-[10px] uppercase tracking-wider opacity-50">{t('pixelOffice.state.idle')}</span>}
              {agent.state === 'offline' && <span className="text-[10px] uppercase tracking-wider opacity-40">{t('pixelOffice.state.offline')}</span>}
              {agent.state === 'waiting' && <span className="text-[10px] uppercase tracking-wider opacity-60">{t('pixelOffice.state.waiting')}</span>}
            </div>
          ))}
          {agents.length === 0 && (
            <div className="text-[var(--text-muted)] text-sm">{t('common.noData')}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={toggleSound}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              soundOn ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]'
                : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-muted)]'
            }`}>
            {soundOn ? '🔔' : '🔕'} {t('pixelOffice.sound')}
          </button>
          <button onClick={toggleEditMode}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              isEditMode ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]'
                : 'bg-[var(--card)] border-[var(--border)] text-[var(--text-muted)]'
            }`}>
            {isEditMode ? t('pixelOffice.exitEdit') : t('pixelOffice.editMode')}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#1a1a2e]">
        <canvas ref={canvasRef}
          onWheel={handleWheel} onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
          className="w-full h-full" />

        {/* Reset view button */}
        <button onClick={resetView}
          className="absolute top-3 right-3 px-2 py-1.5 text-xs rounded-lg border bg-[var(--card)]/80 border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors backdrop-blur-sm"
          title={t('pixelOffice.resetView')}>
          ⊡
        </button>

        {/* Agent hover tooltip */}
        {hoveredInfo && hoveredInfo.agent && !isEditMode && !selectedAgentId && (
          <div className="absolute pointer-events-none z-10 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-sm text-xs shadow-lg"
            style={{ left: Math.min(mousePosRef.current.x + 12, (containerRef.current?.clientWidth || 300) - 180), top: mousePosRef.current.y + 12 }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span>{hoveredInfo.agent.emoji}</span>
              <span className="font-semibold text-[var(--text)]">{hoveredInfo.agent.name}</span>
            </div>
            <div className="space-y-0.5 text-[var(--text-muted)]">
              <div className="flex justify-between gap-4"><span>{t('agent.sessionCount')}</span><span className="text-[var(--text)]">{hoveredInfo.stats?.sessionCount ?? '--'}</span></div>
              <div className="flex justify-between gap-4"><span>{t('agent.messageCount')}</span><span className="text-[var(--text)]">{hoveredInfo.stats?.messageCount ?? '--'}</span></div>
              <div className="flex justify-between gap-4"><span>{t('agent.tokenUsage')}</span><span className="text-[var(--text)]">{hoveredInfo.stats ? formatTokens(hoveredInfo.stats.totalTokens) : '--'}</span></div>
              <div className="flex justify-between gap-4"><span>{t('agent.todayAvgResponse')}</span><span className="text-[var(--text)]">{hoveredInfo.stats?.todayAvgResponseMs ? `${(hoveredInfo.stats.todayAvgResponseMs / 1000).toFixed(1)}s` : '--'}</span></div>
            </div>
          </div>
        )}

        {/* Agent detail card (click) */}
        {selectedAgentId && !isEditMode && (() => {
          const agent = agents.find(a => a.agentId === selectedAgentId)
          const stats = agentStatsRef.current.get(selectedAgentId)
          if (!agent) return null
          const responseColor = stats?.todayAvgResponseMs
            ? stats.todayAvgResponseMs > 50000 ? 'text-red-400'
            : stats.todayAvgResponseMs > 30000 ? 'text-yellow-400'
            : 'text-green-400' : 'text-[var(--text-muted)]'
          return (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40" onClick={() => setSelectedAgentId(null)}>
              <div className="w-72 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl p-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{agent.emoji}</span>
                    <div>
                      <div className="font-semibold text-[var(--text)]">{agent.name}</div>
                      <span className={`text-[10px] uppercase tracking-wider ${
                        agent.state === 'working' ? 'text-green-400' :
                        agent.state === 'idle' ? 'text-yellow-400' : 'text-slate-400'
                      }`}>{t(`pixelOffice.state.${agent.state}`)}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedAgentId(null)} className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none">×</button>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">{t('agent.sessionCount')}</span><span className="text-[var(--text)]">{stats?.sessionCount ?? '--'}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-muted)]">{t('agent.messageCount')}</span><span className="text-[var(--text)]">{stats?.messageCount ?? '--'}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[var(--text-muted)]">{t('agent.tokenUsage')}</span><div className="flex items-center gap-2">{stats?.weeklyTokens && <MiniSparkline data={stats.weeklyTokens} color="#4ade80" />}<span className="text-[var(--text)]">{stats ? formatTokens(stats.totalTokens) : '--'}</span></div></div>
                  <div className="flex justify-between items-center"><span className="text-[var(--text-muted)]">{t('agent.todayAvgResponse')}</span><div className="flex items-center gap-2">{stats?.weeklyResponseMs && <MiniSparkline data={stats.weeklyResponseMs} />}<span className={responseColor}>{stats?.todayAvgResponseMs ? formatMs(stats.todayAvgResponseMs) : '--'}</span></div></div>
                  {stats?.lastActive && <div className="flex justify-between"><span className="text-[var(--text-muted)]">{t('agent.lastActive')}</span><span className="text-[var(--text)]">{new Date(stats.lastActive).toLocaleString('zh-CN')}</span></div>}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Fullscreen photograph viewer */}
        {fullscreenPhoto && photographRef.current && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 cursor-pointer" onClick={() => setFullscreenPhoto(false)}>
            <img src={photographRef.current.src} alt="photograph" className="max-w-[90%] max-h-[90%] object-contain rounded-lg shadow-2xl" />
            <button onClick={() => setFullscreenPhoto(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none">×</button>
          </div>
        )}

        {/* Editor overlays */}
        {isEditMode && (
          <>
            <EditActionBar
              isDirty={editor.isDirty}
              canUndo={editor.undoStack.length > 0}
              canRedo={editor.redoStack.length > 0}
              onUndo={handleUndo} onRedo={handleRedo}
              onSave={handleSave} onReset={handleReset} />
            <EditorToolbar
              activeTool={editor.activeTool}
              selectedTileType={editor.selectedTileType}
              selectedFurnitureType={editor.selectedFurnitureType}
              selectedFurnitureUid={editor.selectedFurnitureUid}
              selectedFurnitureColor={selectedItem?.color ?? null}
              floorColor={editor.floorColor}
              wallColor={editor.wallColor}
              onToolChange={handleToolChange}
              onTileTypeChange={handleTileTypeChange}
              onFloorColorChange={handleFloorColorChange}
              onWallColorChange={handleWallColorChange}
              onSelectedFurnitureColorChange={handleSelectedFurnitureColorChange}
              onFurnitureTypeChange={handleFurnitureTypeChange} />
          </>
        )}
      </div>
    </div>
  )
}
