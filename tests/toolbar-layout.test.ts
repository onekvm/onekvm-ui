import assert from 'node:assert/strict'
import { defaultToolbarIcons } from '../src/lib/toolbar-icons.ts'
import { moveToolbarItem, normalizeToolbarFolders, removeToolbarFolder, syncToolbarIconOrder, toolbarFolderFor, toolbarLayoutOrder, upsertToolbarFolder, type ToolbarLayout } from '../src/lib/toolbar-layout.ts'

const initial: ToolbarLayout = { toolbar_icons: defaultToolbarIcons() }
assert.deepEqual(normalizeToolbarFolders(undefined), [])
assert.equal(toolbarLayoutOrder(initial).length, 16)
const input = { id: 'input', name: '输入', icon: 'Keyboard', items: ['virtual_keyboard', 'tool:terminal/main', 'settings'] }
const first = upsertToolbarFolder(initial, input)
assert.equal(toolbarFolderFor(first.toolbar_folders!, 'virtual_keyboard')?.id, 'input')
assert.equal(first.toolbar_icons!.find(icon => icon.id === 'virtual_keyboard')!.hidden, false)
assert.equal(first.toolbar_folders![0]!.items.includes('settings'), false)
assert.equal(initial.toolbar_icons!.find(icon => icon.id === 'virtual_keyboard')!.hidden, true)
assert.equal(first.toolbar_folders![0]!.items.includes('tool:terminal/main'), true)

const second = upsertToolbarFolder(first, { id: 'other', name: 'Other', icon: 'invalid', items: ['virtual_keyboard'] })
assert.equal(second.toolbar_folders![1]!.icon, 'Folder')
assert.deepEqual(second.toolbar_folders![0]!.items, ['tool:terminal/main'])
assert.deepEqual(second.toolbar_folders![1]!.items, ['virtual_keyboard'])
assert.deepEqual(normalizeToolbarFolders([...second.toolbar_folders!, input]).map(folder => folder.id), ['input', 'other'])

const grouped = moveToolbarItem(second, 'mouse', { folder: 'input', before: 'tool:terminal/main' })
assert.deepEqual(grouped.toolbar_folders![0]!.items, ['mouse', 'tool:terminal/main'])
assert.equal(moveToolbarItem(grouped, 'settings', { folder: 'input' }), grouped)
assert.equal(moveToolbarItem(grouped, 'folder:other', { folder: 'input' }), grouped)
assert.equal(moveToolbarItem(grouped, 'mouse', { folder: 'missing' }), grouped)

const order = toolbarLayoutOrder(grouped, ['terminal/main'])
const movedOut = moveToolbarItem(grouped, 'mouse', { before: 'display' }, order)
assert.equal(toolbarFolderFor(movedOut.toolbar_folders!, 'mouse'), undefined)
assert.equal(movedOut.toolbar_order![0], 'mouse')
const crossGroup = moveToolbarItem(movedOut, 'account', { before: 'display' }, toolbarLayoutOrder(movedOut))
assert.ok(crossGroup.toolbar_order!.indexOf('account') < crossGroup.toolbar_order!.indexOf('display'))
const folderMoved = moveToolbarItem(crossGroup, 'folder:input', { before: 'mouse' }, toolbarLayoutOrder(crossGroup))
assert.equal(folderMoved.toolbar_order![0], 'folder:input')
const toolOut = moveToolbarItem(grouped, 'tool:terminal/main', { before: 'keyboard' }, order)
assert.equal(toolbarFolderFor(toolOut.toolbar_folders!, 'tool:terminal/main'), undefined)
assert.ok(toolOut.toolbar_order!.indexOf('tool:terminal/main') < toolOut.toolbar_order!.indexOf('keyboard'))

const removed = removeToolbarFolder(folderMoved, 'input')
assert.equal(removed.toolbar_folders!.some(folder => folder.id === 'input'), false)
assert.equal(removed.toolbar_order!.includes('folder:input'), false)
assert.equal(toolbarLayoutOrder(removed).includes('virtual_keyboard'), true)
assert.equal(removed.toolbar_icons!.find(icon => icon.id === 'virtual_keyboard')!.hidden, false)
assert.deepEqual(normalizeToolbarFolders([{ id: '../bad', name: 'Bad', icon: 'Folder', items: [] }]), [])
assert.deepEqual(toolbarLayoutOrder({ toolbar_order: ['folder:missing', 'unknown', 'display', 'display'] }).slice(0, 2), ['display', 'mouse'])

const customOrder = ['display', 'folder:input', 'mouse', 'tool:terminal/main', 'settings', 'account']
const iconsReordered = defaultToolbarIcons().map(icon => ({ ...icon }))
const mouseIndex = iconsReordered.findIndex(icon => icon.id === 'mouse')
;[iconsReordered[0], iconsReordered[mouseIndex]] = [iconsReordered[mouseIndex]!, iconsReordered[0]!]
assert.deepEqual(syncToolbarIconOrder(customOrder, iconsReordered), ['mouse', 'folder:input', 'display', 'tool:terminal/main', 'settings', 'account'])
assert.deepEqual(customOrder, ['display', 'folder:input', 'mouse', 'tool:terminal/main', 'settings', 'account'])
assert.deepEqual(syncToolbarIconOrder(undefined, iconsReordered), [])
console.log('toolbar folder and layout tests passed')
