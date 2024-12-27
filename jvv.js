class JsonViewer {

    static create(data, containerEl, options) {
        return new this(data, containerEl, options)
    }

    DEFAULT_OPTIONS = {
        navBar: false,
        arrayLimit: 20_000,
        depth: 2,
        maxDepth: 1000,
        searchDelay: 100,
    }

    MARKER = '\x01'

    constructor(data, containerEl, options) {
        this.options = Object.assign({}, this.DEFAULT_OPTIONS, options ?? {})

        this.data = data

        this.containerEl = containerEl
        this.mainEl = null
        this.contentEl = null

        this.tickCount = 0
        this.tickUpdateStep = 5000

        this.searchInputEl = null
        this.searchInfoEl = null
        this.searchRe = null
        this.searchTimer = null
        this.searchResults = null
        this.searchResultIndex = null
        this.searchPending = []

        this.nowait(this.renderAll(this.options.depth))
    }


    //

    onObjectClick(e) {
        if (this.isLocked()) {
            return
        }

        let rowEl = e.currentTarget
        let depth = e.altKey ? this.options.maxDepth : 1
        this.nowait(this.toggleObject(rowEl, depth))
    }

    onExpandAll() {
        if (this.isLocked()) {
            return
        }
        this.nowait(this.renderContent(this.options.maxDepth))
    }

    onCollapseAll() {
        if (this.isLocked()) {
            return
        }
        this.renderContent(1).then(() => null)
    }

    onSelectAll() {
        if (this.isLocked()) {
            return
        }
        this.selectAll()
    }

    onSearchInput(e) {
        clearTimeout(this.searchTimer)
        this.searchPending.push(this.searchInputEl.value)
        this.searchTimer = setTimeout(() => this.runSearch(), this.options.searchDelay)
    }

    onSearchReset(e) {
        clearTimeout(this.searchTimer)
        this.searchInputEl.value = ''
        this.nowait(this.runSearch())
    }

    onSearchShowPrev(e) {
        if (!this.searchResults) {
            return
        }
        this.searchResultIndex -= 1
        if (this.searchResultIndex < 0) {
            this.searchResultIndex = this.searchResults.length - 1
        }
        this.nowait(this.showSearchResult(this.searchResultIndex))
    }

    onSearchShowNext(e) {
        if (!this.searchResults) {
            return
        }
        this.searchResultIndex += 1
        if (this.searchResultIndex >= this.searchResults.length) {
            this.searchResultIndex = 0
        }
        this.nowait(this.showSearchResult(this.searchResultIndex))
    }

    //

    async runSearch() {
        if (this.isLocked()) {
            return
        }

        this.lock()

        let text = this.searchPending.shift() || ''
        console.log('runSearch', text)

        let searchRe = ''
        let searchResults = []

        text = text.trim()

        if (text.length > 0) {
            searchRe = new RegExp(this.escapeRe(text), 'i')
            await this.searchCollect([], this.data, searchRe, searchResults)
        }

        this.unlock()

        if (this.searchPending.length > 0) {
            console.log('runSearch pending', this.searchPending.length)
            return this.runSearch()
        }

        if (searchResults.length === 0) {
            this.searchRe = null
            this.searchResults = null
            this.searchResultIndex = 0

            this.searchInfoEl.textContent = ''

            this.mainEl.classList.remove('jvv-has-search-results')
            return this.renderContent(this.options.depth)
        }

        this.mainEl.classList.add('jvv-has-search-results')

        this.searchRe = searchRe
        this.searchResults = searchResults
        this.searchResultIndex = 0

        await this.showSearchResult(0)
    }

    async searchCollect(keys, val, searchRe, searchResults) {
        if (this.searchPending.length > 0) {
            return
        }

        await this.addTick()

        let t = this.getType(val)

        switch (t) {
            case this.T.bigint:
            case this.T.number:
            case this.T.string:
                if (searchRe.test(String(val))) {
                    searchResults.push(keys)
                }
                return
            case this.T.array:
            case this.T.object:
                let [isArray, iter, len] = this.getObjectProps(val)
                for (let [k, v] of iter) {
                    await this.searchCollect(keys.concat([k]), v, searchRe, searchResults)
                }
        }
    }

    async showSearchResult(index) {
        let foundKeys = this.searchResults?.[index]
        if (!foundKeys) {
            return
        }

        console.log('showSearchResult', foundKeys)

        await this.renderContent(1)

        let bodyEl = this.contentEl.firstChild?.nextSibling
        if (!bodyEl) {
            return
        }

        let rowEl = await this.expandChain(bodyEl, foundKeys)
        if (rowEl) {
            rowEl.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'})
        }

        this.searchInfoEl.textContent = (index + 1) + '/' + this.searchResults.length

    }

    //

    async expandChain(parEl, foundKeys) {
        for (let rowEl of parEl.querySelectorAll('.jvv-row')) {
            if (!rowEl.dataset || !rowEl.dataset.keys) {
                continue
            }
            let keys = JSON.parse(rowEl.dataset.keys)
            let c = this.compareArrays(foundKeys, keys)

            if (c === 2) {
                return rowEl
            }
            if (c === 1 && rowEl.classList.contains('jvv-object')) {
                await this.renderObjectBody(rowEl, 1)
                let bodyEl = rowEl.nextSibling
                return await this.expandChain(bodyEl, foundKeys)
            }
        }
    }


    async toggleObject(rowEl, depth) {
        if (rowEl.classList.contains('jvv-expanded')) {
            if (depth > 0) {
                await this.unrenderObjectBody(rowEl)
            }
            rowEl.classList.remove('jvv-expanded')
            return
        }

        if (depth > 0 || rowEl.classList.contains('jvv-lazy')) {
            this.lock()
            await this.renderObjectBody(rowEl, depth)
            this.unlock()
        }

        rowEl.classList.add('jvv-expanded')
    }

    selectAll() {
        let range = document.createRange()
        range.selectNodeContents(this.contentEl)
        let sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    }

    //

    isLocked() {
        return this.mainEl && this.mainEl.classList.contains('jvv-locked')
    }

    lock() {
        this.mainEl.classList.add('jvv-locked')
        this.tickCount = 0
    }

    unlock() {
        this.mainEl.classList.remove('jvv-locked')
    }

    //

    async renderAll(depth) {
        this.clear(this.containerEl)
        this.mainEl = this.add(this.containerEl, this.div('jvv'))
        if (this.options.navBar) {
            await this.renderNav()
        }
        this.contentEl = this.add(this.mainEl, this.div('jvv-content'))
        await this.renderContent(depth)
    }

    async renderContent(depth) {
        this.clear(this.contentEl)
        this.lock()
        await this.renderValue(this.contentEl, [], this.data, true, depth)
        this.unlock()
    }

    renderNav() {
        let nav = this.add(this.mainEl, this.div('jvv-nav'))

        let searchBox = this.add(nav, this.span('jvv-search-box'))

        this.searchInputEl = this.add(searchBox, this.elem('input', 'jvv-search-input'))
        this.searchInputEl.addEventListener('input', e => this.onSearchInput(e))
        this.searchInputEl.value = ''

        this.renderNavButton(searchBox, 'Reset', 'jvv-search-reset-button', e => this.onSearchReset(e))

        this.renderNavButton(nav, 'Previous', 'jvv-search-prev-button', e => this.onSearchShowPrev(e))
        this.renderNavButton(nav, 'Next', 'jvv-search-next-button', e => this.onSearchShowNext(e))

        this.searchInfoEl = this.add(nav, this.span('jvv-search-info'))
        this.searchInfoEl.textContent = ''

        this.renderNavButton(nav, 'Expand All', 'jvv-expand-all-button', e => this.onExpandAll(e))
        this.renderNavButton(nav, 'Collapse All', 'jvv-collapse-all-button', e => this.onCollapseAll(e))
        this.renderNavButton(nav, 'Select All', 'jvv-select-all-button', e => this.onSelectAll())
    }

    renderNavButton(parEl, title, cls, handler) {
        let b = this.add(parEl, this.span('jvv-button ' + cls))
        b.title = title
        b.addEventListener('click', handler)
    }

    async renderValue(parEl, keys, val, isLast, depth) {
        await this.addTick()

        let t = this.getType(val)

        switch (t) {
            case this.T.boolean:
            case this.T.number:
            case this.T.bigint:
            case this.T.string:
                return this.renderPrimitive(parEl, keys, val, t, isLast)
            case this.T.undefined:
                return this.renderRaw(parEl, keys, '<undefined>', t, isLast)
            case this.T.emptyobject :
                return this.renderRaw(parEl, keys, '{}', t, isLast)
            case this.T.emptyarray :
                return this.renderRaw(parEl, keys, '[]', t, isLast)
            case this.T.symbol:
                return this.renderRaw(parEl, keys, '<symbol>', t, isLast)
            case this.T.function:
                return this.renderRaw(parEl, keys, '<function>', t, isLast)
            case this.T.null:
                return this.renderRaw(parEl, keys, 'null', t, isLast)
            case this.T.array:
            case this.T.object:
                return this.renderObject(parEl, keys, val, isLast, depth)
        }
    }

    async renderRaw(parEl, keys, val, t, isLast) {
        let rowEl = this.add(parEl, this.span('jvv-row jvv-type-' + this.nameT[t]))
        rowEl.dataset.keys = JSON.stringify(keys)

        if (keys.length > 0) {
            this.add(rowEl, this.drawKey(keys[keys.length - 1]))
        }

        this.add(rowEl, this.span('jvv-value', val))

        if (!isLast) {
            this.add(rowEl, this.drawPunct(','))
        }
    }

    async renderPrimitive(parEl, keys, val, t, isLast) {
        let s

        try {
            s = JSON.stringify(val)
        } catch(e) {
            s = String(val)
        }

        if (t === this.T.string) {
            s = s.slice(1, -1)
        }

        if (this.searchRe) {
            s = s.replace(this.searchRe, this.MARKER + '$&' + this.MARKER)
        }

        if (t === this.T.string) {
            s = '"' + s + '"'
        }

        return this.renderRaw(parEl, keys, s, t, isLast)
    }

    async renderObject(parEl, keys, val, isLast, depth) {
        let [isArray, iter, len] = this.getObjectProps(val)

        let rowEl = this.add(parEl, this.span('jvv-row jvv-object'))
        rowEl.dataset.keys = JSON.stringify(keys)

        let bodyEl = this.add(parEl, this.span('jvv-object-body'))

        let key = keys.length > 0 ? keys[keys.length - 1] : null
        let keyEl = this.add(rowEl, this.drawKey(key))

        if (isArray) {
            rowEl.classList.add('jvv-array')
            keyEl.dataset.after = '(' + len + ') '
        }

        let ob = (isArray ? '[' : '{')
        this.add(rowEl, this.drawPunct(ob))

        rowEl.addEventListener('click', e => this.onObjectClick(e, rowEl))

        if (depth === 0) {
            rowEl.classList.add('jvv-lazy')
        } else {
            await this.renderObjectBody(rowEl, depth)
        }

        let cb = (isArray ? ']' : '}') + (isLast ? '' : ',')
        this.add(parEl, this.drawPunctRow(cb))
    }

    async renderObjectBody(rowEl, depth) {
        rowEl.classList.remove('jvv-lazy')
        rowEl.classList.add('jvv-expanded')

        let bodyEl = rowEl.nextSibling
        this.clear(bodyEl)

        let keys = JSON.parse(rowEl.dataset.keys)
        let val = this.getObject(keys)

        let [isArray, iter, len] = this.getObjectProps(val)
        let innerEl = this.add(bodyEl, this.span('jvv-object-body-inner'))

        let n = 0
        for (let [k, v] of iter) {
            n += 1
            if (n > this.options.arrayLimit) {
                this.add(innerEl, this.drawMore(len - n + 1))
                break
            }
            await this.renderValue(innerEl, keys.concat([k]), v, n === len, depth - 1)
        }
    }

    async unrenderObjectBody(rowEl) {
        rowEl.classList.add('jvv-lazy')
        let bodyEl = rowEl.nextSibling
        this.clear(bodyEl)
    }


    drawKey(key) {
        let keyEl = this.span('jvv-key')
        let t = typeof key

        if (t === 'number') {
            keyEl.dataset.before = '[' + key + '] '
        } else if (t === 'string') {
            keyEl.textContent = JSON.stringify(key) + ': '
        }
        return keyEl

    }

    drawPunct(text, title) {
        return this.span('jvv-punct', text)
    }

    drawPunctRow(text, title) {
        return this.span('jvv-punct-row', text)
    }

    drawMore(count) {
        return this.span('jvv-more', '...(' + count + ')')
    }

    //

    span(cls, text) {
        return this.elem('span', cls, text)
    }

    div(cls) {
        return this.elem('div', cls, '')
    }

    elem(tag, cls, text) {
        let el = document.createElement(tag)
        el.className = cls

        if (!text) {
            return el
        }

        if (!String(text).includes(this.MARKER)) {
            el.textContent = text
            return el
        }

        let parts = String(text).split(this.MARKER)

        let a = document.createTextNode(parts[0] || '')
        let b = document.createElement('mark')
        b.textContent = parts[1] || ''
        let c = document.createTextNode(parts.slice(2).join(''))

        el.appendChild(a)
        el.appendChild(b)
        el.appendChild(c)

        return el
    }

    add(parEl, el) {
        if (parEl && el) {
            parEl.appendChild(el)
            return el
        }
    }

    clear(el) {
        if (el) {
            el.innerHTML = ''
        }
    }

    //

    T = {
        array: 1,
        bigint: 2,
        boolean: 3,
        emptyarray: 4,
        emptyobject: 5,
        function: 6,
        null: 7,
        number: 8,
        object: 9,
        string: 10,
        symbol: 11,
        undefined: 12,
    }

    typeofT = {
        'bigint': this.T.bigint,
        'boolean': this.T.boolean,
        'function': this.T.function,
        'number': this.T.number,
        'string': this.T.string,
        'symbol': this.T.symbol,
        'undefined': this.T.undefined,
    }

    nameT = {
        [this.T.array]: 'array',
        [this.T.bigint]: 'bigint',
        [this.T.boolean]: 'boolean',
        [this.T.emptyarray]: 'emptyarray',
        [this.T.emptyobject]: 'emptyobject',
        [this.T.function]: 'function',
        [this.T.null]: 'null',
        [this.T.number]: 'number',
        [this.T.object]: 'object',
        [this.T.string]: 'string',
        [this.T.symbol]: 'symbol',
        [this.T.undefined]: 'undefined',
    }

    getType(val) {
        let t = typeof val

        if (this.typeofT[t]) {
            return this.typeofT[t]
        }

        if (!val) {
            return this.T.null
        }

        if (Array.isArray(val)) {
            return (val.length === 0) ? this.T.emptyarray : this.T.array
        }

        for (let _ in val) {
            return this.T.object
        }

        return this.T.emptyobject
    }

    getObject(keys) {
        let val = this.data
        for (let k of keys) {
            val = val[k]
        }
        return val
    }

    getObjectProps(val) {
        let isArray = Array.isArray(val)
        let iter = isArray ? val.entries() : Object.entries(val)
        let len = isArray ? val.length : iter.length
        return [isArray, iter, len]
    }


    compareArrays(arr, sub) {
        if (sub.length > arr.length) {
            return -1
        }
        for (let i = 0; i < sub.length; i++) {
            if (arr[i] !== sub[i]) {
                return -1
            }
        }
        return sub.length === arr.length ? 2 : 1
    }

    escapeRe(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    async addTick() {
        this.tickCount = ((this.tickCount || 0) + 1) % (this.tickUpdateStep)
        if (this.tickCount === 0) {
            await this.sleep(1)
        }
    }


    sleep(n) {
        return new Promise(res => setTimeout(res, n))
    }

    nowait(p) {
        p.then(() => null)
    }

}
