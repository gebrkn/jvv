class JsonViewer {

    MAX_DEPTH = 1000
    MAX_ARRAY_LIMIT = 20000

    DEFAULT_OPTIONS = {
        navBar: false,
        arrayLimit: this.MAX_ARRAY_LIMIT,
        depth: 2,
    }

    constructor(data, containerEl, options) {
        this.options = Object.assign({}, this.DEFAULT_OPTIONS, options ?? {})

        this.data = data
        this.containerEl = containerEl
        this.mainEl = null
        this.objectMap = []
        this.renderCount = 0
        this.renderUpdateStep = 5000

        this.renderAll(this.options.depth || this.MAX_DEPTH).then(() => null)
    }


    //

    onObjectClick(e) {
        if (this.isLocked()) {
            return
        }

        let rowEl = e.currentTarget
        this.expandObject(rowEl, e.altKey ? this.MAX_DEPTH : 0).then(() => null)
    }

    onExpandAll() {
        if (this.isLocked()) {
            return
        }
        this.renderAll(this.MAX_DEPTH).then(() => null)
    }

    onCollapseAll() {
        if (this.isLocked()) {
            return
        }
        this.renderAll(1).then(() => null)
    }

    onSelectAll() {
        if (this.isLocked()) {
            return
        }
        this.selectAll()
    }

    //

    async expandObject(rowEl, depth) {
        if (rowEl.classList.contains('jvv-on')) {
            if (depth > 0) {
                await this.unRenderLazyObject(rowEl)
            }
            rowEl.classList.remove('jvv-on')
            return
        }

        if (depth > 0 || rowEl.classList.contains('jvv-lazy')) {
            this.beginRender()
            await this.renderLazyObject(rowEl, depth)
            this.endRender()
        }

        rowEl.classList.add('jvv-on')
    }

    selectAll() {
        let range = document.createRange()
        range.selectNodeContents(this.mainEl.lastChild)
        let sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    }

    //

    isLocked() {
        return this.mainEl && this.mainEl.classList.contains('jvv-locked')
    }

    async renderAll(depth) {
        this.containerEl.innerHTML = ''

        this.mainEl = this.div('jvv')
        this.add(this.containerEl, this.mainEl)

        if (this.options.navBar) {
            await this.renderNav()
        }

        let contentEl = this.add(this.mainEl, this.div('jvv-content'))

        this.objectMap = []

        this.beginRender()
        await this.renderValue(contentEl, null, this.data, true, depth)
        this.endRender()
    }

    renderNav() {
        let nav = this.add(this.mainEl, this.div('jvv-nav'))

        // let fb = add(div('jvv-search-box'), nav)
        // this.add(this.elem('input'), fb)
        // this.add(this.elem('button', 'jvv-search-reset-button'), fb)
        //
        // this.add(this.elem('button', 'jvv-search-prev-button'), nav)
        // this.add(this.elem('button', 'jvv-search-next-button'), nav)
        // this.searchInfoDiv = this.add(this.elem('span', 'jvv-search-info'), nav)
        //
        // this.add(div('jvv-flex'), nav)

        // nav.querySelector('.jvv-search-box input').addEventListener('input', e => this.onSearchInput(e))
        // nav.querySelector('.jvv-search-prev-button').addEventListener('click', e => this.onSearchPrev(e))
        // nav.querySelector('.jvv-search-next-button').addEventListener('click', e => this.onSearchNext(e))
        // nav.querySelector('.jvv-search-reset-button').addEventListener('click', e => this.onSearchReset(e))

        let b

        b = this.add(nav, this.span('jvv-button jvv-expand-all-button'))
        b.title = 'Expand All'
        b.addEventListener('click', e => this.onExpandAll(e))

        b = this.add(nav, this.span('jvv-button jvv-collapse-all-button'))
        b.title = 'Collapse All'
        b.addEventListener('click', e => this.onCollapseAll(e))

        b = this.add(nav, this.span('jvv-button jvv-select-all-button'))
        b.title = 'Select All'
        b.addEventListener('click', e => this.onSelectAll())
    }

    beginRender() {
        this.mainEl.classList.add('jvv-locked')
        this.renderCount = 0
    }

    endRender() {
        this.mainEl.classList.remove('jvv-locked')
    }

    async renderValue(parEl, key, val, isLast, depth) {
        this.renderCount += 1

        if (this.renderCount % this.renderUpdateStep === 0) {
            await this.sleep(1)
        }

        let t = this.getType(val)

        switch (t) {
            case this.T.undefined:
                return this.renderAtom(parEl, key, '<undefined>', 'undefined', isLast)
            case this.T.boolean:
                return this.renderAtom(parEl, key, val, 'boolean', isLast)
            case this.T.number:
                return this.renderAtom(parEl, key, val, 'number', isLast)
            case this.T.bigint:
                return this.renderAtom(parEl, key, val, 'bigint', isLast)
            case this.T.string:
                return this.renderAtom(parEl, key, val, 'string', isLast)
            case this.T.symbol:
                return this.renderAtom(parEl, key, '<symbol>', 'symbol', isLast)
            case this.T.function:
                return this.renderAtom(parEl, key, '<function>', 'function', isLast)
            case this.T.null:
                return this.renderAtom(parEl, key, null, 'null', isLast)
            case this.T.empty_object :
                return this.renderAtom(parEl, key, {}, 'empty_object', isLast)
            case this.T.empty_array :
                return this.renderAtom(parEl, key, [], 'empty_array', isLast)
            case this.T.array:
            case this.T.object:
                return this.renderObject(parEl, key, val, isLast, depth)
        }
    }

    async renderAtom(parEl, key, val, kind, isLast) {
        let rowEl = this.add(parEl, this.span('jvv-row jvv-' + kind))
        if (key) {
            this.add(rowEl, this.drawKey(key))
        }
        this.add(rowEl, this.span('jvv-value', JSON.stringify(val)))
        if (!isLast) {
            this.add(rowEl, this.drawPunct(','))
        }
    }

    async renderObject(parEl, key, val, isLast, depth) {
        let [isArray, iter, len] = this.objectProps(val)

        let ob = (isArray ? '[' : '{')
        let cb = (isArray ? ']' : '}') + (isLast ? '' : ',')

        let rowEl = this.add(parEl, this.span('jvv-row jvv-object'))

        if (isArray) {
            rowEl.classList.add('jvv-array')
            let keyEl = this.drawKey(key || '')
            keyEl.dataset.after = '(' + len + ') '
            this.add(rowEl, keyEl)
        } else if (key) {
            this.add(rowEl, this.drawKey(key))
        }
        this.add(rowEl, this.drawPunct(ob))

        rowEl.addEventListener('click', e => this.onObjectClick(e, rowEl))

        let bodyEl = this.add(parEl, this.span('jvv-object-body'))
        bodyEl.dataset.objectId = String(this.objectMap.length)
        this.objectMap.push(val)

        if (depth === 0) {
            rowEl.classList.add('jvv-lazy')
        } else {
            rowEl.classList.add('jvv-loaded')
            rowEl.classList.add('jvv-on')
            await this.renderObjectBodyWithProps(bodyEl, val, depth - 1, isArray, iter, len)
        }

        this.add(parEl, this.drawPunctRow(cb))
    }

    async renderLazyObject(rowEl, depth) {
        rowEl.classList.remove('jvv-lazy')
        rowEl.classList.add('jvv-loaded')
        rowEl.classList.add('jvv-on')

        let bodyEl = rowEl.nextSibling
        bodyEl.innerHTML = ''

        let objId = bodyEl.dataset.objectId
        let val = this.objectMap[objId]

        await this.renderObjectBody(bodyEl, val, depth)
    }

    async unRenderLazyObject(rowEl) {
        rowEl.classList.add('jvv-lazy')
        rowEl.classList.remove('jvv-loaded')

        let bodyEl = rowEl.nextSibling
        bodyEl.innerHTML = ''
    }

    async renderObjectBody(bodyEl, val, depth) {
        let [isArray, iter, len] = this.objectProps(val)
        await this.renderObjectBodyWithProps(bodyEl, val, depth, isArray, iter, len)
    }

    async renderObjectBodyWithProps(bodyEl, val, depth, isArray, iter, len) {
        let innerEl = this.add(bodyEl, this.span('jvv-object-body-inner'))

        let n = 0
        for (let [k, v] of iter) {
            n += 1
            if (n > this.options.arrayLimit) {
                this.add(innerEl, this.drawMore(len - n + 1))
                break
            }
            await this.renderValue(innerEl, isArray ? null : k, v, n === len, depth)
        }
    }

    objectProps(val) {
        let isArray = Array.isArray(val)
        let iter = isArray ? val.entries() : Object.entries(val)
        let len = isArray ? val.length : iter.length
        return [isArray, iter, len]
    }

    drawKey(key) {
        return this.span('jvv-key', key ? (JSON.stringify(key) + ': ') : '')
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
        if (text) {
            el.textContent = text
        }
        return el
    }

    add(parent, el) {
        if (el) {
            parent.appendChild(el)
            return el
        }
    }

    //

    T = {
        undefined: 1,
        boolean: 2,
        number: 3,
        bigint: 4,
        string: 5,
        symbol: 6,
        function: 7,
        null: 8,
        object: 10,
        empty_object: 11,
        array: 12,
        empty_array: 13,
    }

    strT = {
        'undefined': this.T.undefined,
        'symbol': this.T.symbol,
        'function': this.T.function,
        'boolean': this.T.boolean,
        'number': this.T.number,
        'bigint': this.T.bigint,
        'string': this.T.string,
    }

    getType(val) {
        let t = typeof val

        if (this.strT[t]) {
            return this.strT[t]
        }

        if (!val) {
            return this.T.null
        }

        if (Array.isArray(val)) {
            return (val.length === 0) ? this.T.empty_array : this.T.array
        }

        for (let _ in val) {
            return this.T.object
        }

        return this.T.empty_object
    }

    //

    sleep(n) {
        return new Promise(res => setTimeout(res, n))
    }

}
