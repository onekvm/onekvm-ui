import assert from 'node:assert/strict'
import { defaultToolbarIcons } from '../src/lib/toolbar-icons.ts'
import { groupToolbarItems, isToolbarSeparator, moveToolbarItem, normalizeToolbarFolders, removeToolbarFolder, syncToolbarIconOrder, toolbarFolderFor, toolbarLayoutOrder, upsertToolbarFolder, visibleToolbarSeparators, type ToolbarLayout } from '../src/lib/toolbar-layout.ts'

const initial: ToolbarLayout = { toolbar_icons: defaultToolbarIcons() }
assert.deepEqual(normalizeToolbarFolders(undefined), [])
assert.equal(toolbarLayoutOrder(initial).length, 19)
assert.ok(toolbarLayoutOrder(initial).includes('separator:controls'))
assert.equal(toolbarLayoutOrder(initial).at(-2), 'separator:account')
assert.deepEqual(visibleToolbarSeparators(toolbarLayoutOrder(initial), new Set(['display', 'fullscreen', 'account'])), ['separator:controls', 'separator:account'])
assert.deepEqual(visibleToolbarSeparators(toolbarLayoutOrder(initial), new Set(['display', 'account'])), ['separator:controls'])
assert.deepEqual(visibleToolbarSeparators(toolbarLayoutOrder(initial), new Set(['account'])), [])
assert.deepEqual(visibleToolbarSeparators(['separator:custom', 'account'], new Set(['account'])), ['separator:custom'])
const withSeparator = { ...initial, toolbar_order: ['display', 'separator:custom', 'mouse'] }
assert.deepEqual(toolbarLayoutOrder(withSeparator).slice(0, 3), ['display', 'separator:custom', 'mouse'])
assert.equal(isToolbarSeparator('separator:../bad'), false)
const separatorMoved = moveToolbarItem(withSeparator, 'separator:custom', { before: 'display' })
assert.equal(separatorMoved.toolbar_order![0], 'separator:custom')
assert.equal(moveToolbarItem(withSeparator, 'separator:custom', { folder: 'input' }), withSeparator)
const merged = groupToolbarItems(initial, 'mouse', 'display', { id: 'merged', name: 'Folder', icon: 'Rocket', items: [] })
assert.deepEqual(merged.toolbar_folders![0]!.items, ['display', 'mouse'])
assert.equal(merged.toolbar_folders![0]!.icon, 'Rocket')
assert.equal(merged.toolbar_order![0], 'folder:merged')
assert.equal(groupToolbarItems(initial, 'settings', 'display', { id: 'bad', name: 'Folder', icon: 'Folder', items: [] }), initial)
assert.equal(normalizeToolbarFolders([{ id: 'custom', name: 'Custom', icon: 'shield-check', items: [] }])[0]!.icon, 'shield-check')
const input = { id: 'input', name: '输入', icon: 'Keyboard', items: ['virtual_keyboard', 'tool:terminal/main', 'settings'] }
const first = upsertToolbarFolder(initial, input)
assert.equal(toolbarFolderFor(first.toolbar_folders!, 'virtual_keyboard')?.id, 'input')
assert.equal(first.toolbar_icons!.find(icon => icon.id === 'virtual_keyboard')!.hidden, false)
assert.equal(first.toolbar_folders![0]!.items.includes('settings'), false)
assert.equal(initial.toolbar_icons!.find(icon => icon.id === 'virtual_keyboard')!.hidden, true)
assert.equal(first.toolbar_folders![0]!.items.includes('tool:terminal/main'), true)
const collectionInFolder = upsertToolbarFolder(initial, { ...input, items: ['collection', 'mouse'] })
assert.deepEqual(collectionInFolder.toolbar_folders![0]!.items, ['mouse'])
assert.equal(groupToolbarItems(initial, 'collection', 'display', { id: 'bad', name: 'Folder', icon: 'Folder', items: [] }), initial)
assert.equal(moveToolbarItem(first, 'collection', { folder: 'input' }), first)
const collectionMoved = moveToolbarItem(initial, 'collection', { before: 'performance' })
assert.ok(toolbarLayoutOrder(collectionMoved).indexOf('collection') < toolbarLayoutOrder(collectionMoved).indexOf('performance'))
assert.equal(toolbarLayoutOrder(JSON.parse(JSON.stringify(collectionMoved))).indexOf('collection'), toolbarLayoutOrder(collectionMoved).indexOf('collection'))

const second = upsertToolbarFolder(first, { id: 'other', name: 'Other', icon: 'invalid!', items: ['virtual_keyboard'] })
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

// Dissolve a folder at its displayed position, preserving member order even
// when members still have stale root positions or have never appeared there.
const dissolveFolder = { id: 'dissolve', name: 'Dissolve', icon: 'Folder', items: ['keyboard', 'tool:terminal/main', 'performance'] }
for (const rootOrder of [
  ['folder:dissolve', 'display', 'mouse', 'account'],
  ['display', 'keyboard', 'separator:custom', 'folder:dissolve', 'mouse', 'tool:terminal/main', 'account'],
  ['display', 'mouse', 'account', 'folder:dissolve'],
]) {
  const layout: ToolbarLayout = { ...initial, toolbar_folders: [dissolveFolder], toolbar_order: rootOrder }
  const before = JSON.stringify(layout)
  const dissolved = removeToolbarFolder(layout, 'dissolve', rootOrder)
  const unrelated = ['display', 'mouse', 'account', 'separator:custom']
  assert.deepEqual(dissolved.toolbar_order!.filter(id => unrelated.includes(id)), rootOrder.filter(id => unrelated.includes(id)))
  const position = dissolved.toolbar_order!.indexOf('keyboard')
  assert.deepEqual(dissolved.toolbar_order!.slice(position, position + 3), dissolveFolder.items)
  assert.equal(position, rootOrder.slice(0, rootOrder.indexOf('folder:dissolve')).filter(id => unrelated.includes(id)).length)
  for (const member of dissolveFolder.items) assert.equal(dissolved.toolbar_order!.filter(id => id === member).length, 1)
  assert.deepEqual(dissolved.toolbar_folders, [])
  assert.equal(JSON.stringify(layout), before)
  assert.deepEqual(toolbarLayoutOrder(JSON.parse(JSON.stringify(dissolved))).slice(0, dissolved.toolbar_order!.length), dissolved.toolbar_order)
}
const defaultFolderLayout: ToolbarLayout = { ...initial, toolbar_folders: [dissolveFolder, { id: 'keep', name: 'Keep', icon: 'Folder', items: ['audio'] }] }
const defaultRoot = toolbarLayoutOrder(defaultFolderLayout, ['terminal/main', 'other/main'])
const defaultDissolved = removeToolbarFolder(defaultFolderLayout, 'dissolve', defaultRoot)
assert.ok(defaultDissolved.toolbar_order!.indexOf('tool:other/main') < defaultDissolved.toolbar_order!.indexOf('keyboard'))
assert.deepEqual(defaultDissolved.toolbar_folders, [defaultFolderLayout.toolbar_folders![1]])
assert.equal(removeToolbarFolder(defaultFolderLayout, 'missing'), defaultFolderLayout)
const emptyFolderLayout: ToolbarLayout = { ...initial, toolbar_folders: [{ ...dissolveFolder, items: [] }] }
assert.deepEqual(removeToolbarFolder(emptyFolderLayout, 'dissolve').toolbar_order, toolbarLayoutOrder(emptyFolderLayout).filter(id => id !== 'folder:dissolve'))

assert.deepEqual(normalizeToolbarFolders([{ id: '../bad', name: 'Bad', icon: 'Folder', items: [] }]), [])
assert.deepEqual(toolbarLayoutOrder({ toolbar_order: ['folder:missing', 'unknown', 'display', 'display'] }).slice(0, 2), ['display', 'mouse'])

const customOrder = ['display', 'folder:input', 'mouse', 'tool:terminal/main', 'settings', 'account']
const iconsReordered = defaultToolbarIcons().map(icon => ({ ...icon }))
const mouseIndex = iconsReordered.findIndex(icon => icon.id === 'mouse')
;[iconsReordered[0], iconsReordered[mouseIndex]] = [iconsReordered[mouseIndex]!, iconsReordered[0]!]
assert.deepEqual(syncToolbarIconOrder(customOrder, iconsReordered), ['mouse', 'folder:input', 'display', 'tool:terminal/main', 'collection', 'settings', 'account'])
assert.deepEqual(customOrder, ['display', 'folder:input', 'mouse', 'tool:terminal/main', 'settings', 'account'])
assert.deepEqual(syncToolbarIconOrder(undefined, iconsReordered), [])
console.log('toolbar folder and layout tests passed')
