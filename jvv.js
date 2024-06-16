class JsonViewer {

    constructor(data) {
        this.data = data
        this.mainDiv = null
        this.treeDiv = null
        this.rows = []

        this.searchFoundRows = []
        this.searchFoundRowIndex = 0
        this.searchInfoDiv = null

        this.searchTimeout = 500
        this.searchTimer = 0

        this.arrayLimit = 100
    }

    // options: topBar, expandAll, arrayLimit

    draw(parentElement, options) {
        this.rows = []
        this.rowCreate('', this.data, null, true)

        options = options || {}

        this.arrayLimit = options.arrayLimit || this.arrayLimit

        this.mainDiv = add(div('jvv'), parentElement)

        if (options.topBar) {
            this.drawTop()
        }

        this.drawTree(parentElement)

        if (options.expandAll) {
            this.expandAll()
        } else {
            this.rowExpand(this.rows[0])
        }
    }

    //

    rowCreate(key, val, parentRow, isLast) {
        let row = {parentRow, key, isLast, type: getType(val), val}

        this.rowReset(row)

        this.rows.push(row)
        row.id = this.rows.length - 1

        this.subRows(row)
        return row
    }

    subRows(row) {
        if (row.sub && row.sub.length > 0) {
            return row.sub
        }
        if (row.type === t_object || row.type === t_array) {
            row.sub = []
            let pairs = Object.entries(row.val)
            let n = 0
            for (let [k, v] of pairs) {
                row.sub.push(this.rowCreate(k, v, row, n === pairs.length - 1))
            }
            return row.sub
        }
        return []
    }

    rowReset(row) {
        row.div = null
        row.bodyDiv = null
        row.keyDiv = null
        row.valDiv = null
        row.hasFullBody = (row.type !== t_array && row.type !== t_object)
    }

    rowDiv(row) {
        if (row.div) {
            return row.div
        }

        let isObj = row.type === t_object
        let isArr = row.type === t_array

        row.div = div('jvv-row')
        row.div.id = 'jvvRow_' + row.id

        let head = add(div('jvv-head'), row.div)

        if (isObj || isArr) {
            row.bodyDiv = add(div('jvv-body'), row.div)
            let btn = add(elem('button', 'jvv-expand-button'), head)
            btn.id = 'jvvExp_' + row.id
        } else {
            add(elem('button', 'jvv-dummy-button'), head)
        }

        if (row.id > 0) {
            if (row.parentRow && row.parentRow.type === t_array) {
                row.keyDiv = add(div('jvv-array-key', '[' + row.key + ']'), head)
            } else {
                row.keyDiv = add(div('jvv-object-key', row.key), head)
            }
        }

        // key += ':' + row.id

        if (isObj) {
            add(this.drawPreview(row), head)
            // add(div('jvv-paren', '{'), head)
            // add(div('jvv-paren', '}'), add(div('jvv-foot'), row.div))
        } else if (isArr) {
            add(this.drawPreview(row), head)
            // add(div('jvv-paren', '['), head)
            // add(div('jvv-paren', ']'), add(div('jvv-foot'), row.div))
        } else {
            row.valDiv = add(this.drawValue(row), head)
        }

        return row.div
    }

    rowExpand(row) {
        this.drawBody(row)
        addClass(row.div, 'jvv-open')
        this.rowExpandParents(row)
    }

    rowExpandParents(row) {
        let path = []

        while (row) {
            path.push(row)
            row = row.parentRow
        }

        path = path.reverse()

        for (let i = 0; i < path.length - 1; i += 1) {
            let par = path[i]
            this.drawBody(par, {ensureSubRow: path[i + 1]})
            addClass(par.div, 'jvv-open')
        }
    }

    rowCollapse(row) {
        delClass(row.div, 'jvv-open')
    }

    expandAll() {
        for (let row of this.rows) {
            if (row.div) {
                this.drawBody(row)
                addClass(row.div, 'jvv-open')
            }
        }
    }

    collapseAll() {
        for (let row of this.rows) {
            this.rowReset(row)
        }
        this.treeDiv.innerHTML = ''
        add(this.rowDiv(this.rows[0]), this.treeDiv)
        this.rowExpand(this.rows[0])
    }


    rowFocus(row) {
        this.rowExpandParents(row)
        setTimeout(() => scrollTo(row.div), 100)
    }

    //

    drawTop() {
        let top = add(div('jvv-top'), this.mainDiv)

        let fb = add(div('jvv-search-box'), top)
        add(elem('input'), fb)
        add(elem('button', 'jvv-search-reset-button'), fb)

        add(elem('button', 'jvv-search-prev-button'), top)
        add(elem('button', 'jvv-search-next-button'), top)
        this.searchInfoDiv = add(elem('span', 'jvv-search-info'), top)

        add(div('jvv-flex'), top)

        add(elem('button', 'jvv-expand-all-button'), top)
        add(elem('button', 'jvv-collapse-all-button'), top)

        top.querySelector('.jvv-search-box input').addEventListener('input', e => this.onSearchInput(e))
        top.querySelector('.jvv-search-prev-button').addEventListener('click', e => this.onSearchPrev(e))
        top.querySelector('.jvv-search-next-button').addEventListener('click', e => this.onSearchNext(e))
        top.querySelector('.jvv-search-reset-button').addEventListener('click', e => this.onSearchReset(e))

        top.querySelector('.jvv-expand-all-button').addEventListener('click', e => this.onExpandAll(e))
        top.querySelector('.jvv-collapse-all-button').addEventListener('click', e => this.onCollapseAll(e))

    }

    drawTree() {
        this.treeDiv = add(div('jvv-tree'), this.mainDiv)
        this.treeDiv.addEventListener('click', e => this.onTreeClick(e))
        add(this.rowDiv(this.rows[0]), this.treeDiv)
    }

    drawPreview(row) {
        if (row.type === t_array) {
            let len = row.val.length
            return div('jvv-preview', `[…] (${len})`)
        }
        if (row.type === t_object) {
            let len = Object.keys(row.val).length
            return div('jvv-preview', `{…} (${len})`)
        }
    }

    drawValue(row) {
        switch (row.type) {
            case t_undefined:
                return div('jvv-val-undefined', 'undefined')
            case t_boolean:
                return div('jvv-val-boolean', String(row.val))
            case t_number:
                return div('jvv-val-number', String(row.val))
            case t_bigint:
                return div('jvv-val-bigint', String(row.val))
            case t_string:
                return div('jvv-val-string', JSON.stringify(row.val))
            case t_symbol:
                return div('jvv-val-symbol', 'symbol')
            case t_function:
                return div('jvv-val-function', 'function')
            case t_null:
                return div('jvv-val-null', 'null')
            case t_empty_object :
                return div('jvv-val-empty_object', '{}')
            case t_empty_array :
                return div('jvv-val-empty_array', '[]')
        }
    }

    drawBody(row, args) {
        this.rowDiv(row)

        if (row.hasFullBody) {
            return
        }
        if (row.type === t_object) {
            this.drawObjectBody(row)
            return
        }
        if (row.type === t_array) {
            this.drawArrayBody(row, args ?? {})
            return
        }
        row.hasFullBody = true
    }

    drawObjectBody(row) {

        let alignKeys = () => {
            let w = 0
            for (let subRow of this.subRows(row)) {
                w = Math.max(w, subRow.keyDiv.scrollWidth)
            }
            for (let subRow of this.subRows(row)) {
                subRow.keyDiv.style.minWidth = w + 'px'
            }
        }

        for (let subRow of this.subRows(row)) {
            add(this.rowDiv(subRow), row.bodyDiv)
        }

        row.hasFullBody = true

        setTimeout(alignKeys, 100)
    }

    drawArrayBody(row, args) {
        // args.ensureSubRow -> make sure this sub row is drawn
        // args.showMore     -> show next page


        if (row.val.length <= this.arrayLimit) {
            // short array, ignore args
            for (let subRow of this.subRows(row)) {
                add(this.rowDiv(subRow), row.bodyDiv)
            }
            row.hasFullBody = true
            return
        }

        let visibleSubRows = []

        for (let el of row.bodyDiv.getElementsByClassName('jvv-row')) {
            let row = this.rowFromEl(el)
            if (row) {
                visibleSubRows.push(row)
            }
        }

        let visibleIds = new Set(visibleSubRows.map(r => r.id))

        if (args.ensureSubRow) {
            if (!visibleIds.has(args.ensureSubRow.id)) {
                visibleSubRows.push(args.ensureSubRow)
                this.redrawArrayBody(row, visibleSubRows)
            }
            return
        }

        if (visibleSubRows.length > 0 && !args.showMore) {
            return
        }

        let cntNew = 0

        for (let subRow of this.subRows(row)) {
            if (visibleIds.has(subRow.id)) {
                continue
            }
            visibleSubRows.push(subRow)
            cntNew += 1
            if (cntNew >= this.arrayLimit) {
                break
            }
        }

        this.redrawArrayBody(row, visibleSubRows)
    }

    redrawArrayBody(row, visibleSubRows) {
        let more = this.rowMoreIndicator(row)
        if (more) {
            row.bodyDiv.removeChild(more)
        }

        visibleSubRows.sort((a, b) => a.id - b.id)

        for (let visRow of visibleSubRows) {
            row.bodyDiv.appendChild(this.rowDiv(visRow))
        }

        let rest = row.val.length - visibleSubRows.length

        if (rest > 0) {
            more = add(div('jvv-more', `…${rest} more`), row.bodyDiv)
            more.id = 'jvvMore_' + row.id
        }
    }

    //

    rowsWithClass(cls) {
        let rows = []

        for (let div of this.treeDiv.querySelectorAll('.' + cls)) {
            let row = this.rowFromEl(div)
            if (row) {
                rows.push(row)
            }
        }

        return rows
    }

    rowFromEl(el) {
        return this.rows[el.id.split('_')[1]]
    }

    rowMoreIndicator(row) {
        if (!row.bodyDiv) {
            return
        }
        let r = row.bodyDiv.getElementsByClassName('jvv-more')
        return r.item(0)
    }

    //

    onTreeClick(e) {
        let el = e.target

        if (el.classList.contains('jvv-expand-button')) {
            let row = this.rowFromEl(el)
            if (row) {
                if (row.div.classList.contains('jvv-open')) {
                    this.rowCollapse(row)
                } else {
                    this.rowExpand(row)
                }
            }
        }

        if (el.classList.contains('jvv-more')) {
            let row = this.rowFromEl(el)
            if (row) {
                this.drawArrayBody(row, {showMore: true})
                setTimeout(() => scrollTo(this.rowMoreIndicator(row)), 100)
            }
        }
    }

    onExpandAll(e) {
        this.expandAll()
    }

    onCollapseAll(e) {
        this.collapseAll()
    }


    //

    onSearchInput(e) {
        clearTimeout(this.searchTimer)
        this.searchTimer = setTimeout(() => this.searchExec(e.target.value), this.searchTimeout)
    }

    onSearchPrev(e) {
        this.searchContinue(-1)
    }

    onSearchNext(e) {
        this.searchContinue(+1)
    }

    onSearchReset(e) {
        this.searchReset()
        let inp = this.mainDiv.querySelector('.jvv-search-box input')
        inp.value = ''
        inp.rowFocus()
    }

    searchMatches(row, str) {
        if (row.key.includes(str)) {
            return true
        }
        if (row.type === t_string) {
            return row.val.includes(str)
        }
        if (row.type === t_number) {
            return String(row.val).includes(str)
        }
    }

    searchExec(str) {
        this.searchReset()

        str = String(str).trim()
        if (str.length === 0) {
            return
        }

        this.searchFoundRows = this.rows.filter(r => this.searchMatches(r, str))
        this.searchFoundRowIndex = 0

        this.mainDiv.classList.add('jvv-has-search')

        let len = this.searchFoundRows.length
        if (len === 0) {
            this.searchInfoDiv.textContent = '0/0'
            return
        }

        this.mainDiv.classList.add('jvv-has-search-results')
        this.searchGoto(0)
    }

    searchContinue(d) {
        let len = this.searchFoundRows.length
        if (len === 0) {
            return
        }

        this.searchFoundRowIndex += d
        if (this.searchFoundRowIndex < 0) {
            this.searchFoundRowIndex = len - 1
        }
        if (this.searchFoundRowIndex >= len) {
            this.searchFoundRowIndex = 0
        }

        this.searchGoto(this.searchFoundRowIndex)
    }

    searchGoto(n) {
        this.searchFoundRowIndex = n
        this.searchInfoDiv.textContent = (n + 1) + '/' + this.searchFoundRows.length
        this.rowFocus(this.searchFoundRows[n])
        this.searchHighlight()
    }

    searchHighlight() {
        for (let row of this.rowsWithClass('jvv-found-curr')) {
            delClass(row.div, 'jvv-found-curr')
        }

        for (let row of this.searchFoundRows) {
            addClass(row.div, 'jvv-found')
        }

        let curr = this.searchFoundRows[this.searchFoundRowIndex]
        if (curr) {
            addClass(curr.div, 'jvv-found-curr')
        }
    }

    searchReset() {
        this.searchFoundRows = []
        this.searchFoundRowIndex = 0
        this.searchInfoDiv.textContent = ''

        this.mainDiv.classList.remove('jvv-has-search')
        this.mainDiv.classList.remove('jvv-has-search-results')

        for (let row of this.rowsWithClass('jvv-found-curr')) {
            delClass(row.div, 'jvv-found-curr')
        }
        for (let row of this.rowsWithClass('jvv-found')) {
            delClass(row.div, 'jvv-found')
        }
    }
}

//


function pause(n) {
    return new Promise(r => setTimeout(r, n))
}

function div(cls, text) {
    return elem('div', cls, text)
}

function elem(tag, cls, text) {
    let e = document.createElement(tag)
    e.className = cls
    if (text) {
        e.textContent = text
    }
    return e
}

function add(e, parent) {
    parent.appendChild(e)
    return e
}

function addClass(el, cls) {
    if (el) {
        el.classList.add(cls)
    }
}

function delClass(el, cls) {
    if (el) {
        el.classList.remove(cls)
    }
}

function scrollTo(el) {
    if (el) {
        el.scrollIntoView({
            block: 'nearest',
            behavior: 'instant',
        })
    }
}


const t_undefined = 1
const t_boolean = 2
const t_number = 3
const t_bigint = 4
const t_string = 5
const t_symbol = 6
const t_function = 7
const t_null = 8

const t_object = 10
const t_empty_object = 11
const t_array = 12
const t_empty_array = 13

const types = {
    'undefined': t_undefined,
    'symbol': t_symbol,
    'function': t_function,
    'boolean': t_boolean,
    'number': t_number,
    'bigint': t_bigint,
    'string': t_string,
}

function getType(val) {
    let t = typeof val
    if (types[t])
        return types[t]
    if (!val)
        return t_null
    if (Array.isArray(val)) {
        return (val.length === 0) ? t_empty_array : t_array
    }
    return (Object.keys(val).length === 0) ? t_empty_object : t_object
}
