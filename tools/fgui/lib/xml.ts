/**
 * 极简 XML 解析（零依赖）：
 * 面向 FGUI 源 XML（package.xml / 组件 .xml）这类结构规整的文档——
 * 属性双引号、自闭合标签、嵌套元素、少量实体（&amp; &#xD; 等）。
 * 不支持 DOCTYPE/CDATA/命名空间，遇到会忽略或报错。
 */

export interface XmlElement {
    readonly name: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly children: readonly XmlElement[];
}

export class XmlParseError extends Error {
    constructor(message: string, readonly index: number) {
        super(`${message}（位置 ${index}）`);
        this.name = "XmlParseError";
    }
}

const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
};

/** 解码 XML 实体：&amp; &lt; &gt; &quot; &apos; &#DDD; &#xHH; */
export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
        if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        return ENTITIES[entity] ?? match;
    });
}

function skipWhitespace(source: string, i: number): number {
    while (i < source.length && /\s/.test(source[i]!)) i++;
    return i;
}

function parseTagName(source: string, i: number): string {
    const start = i;
    while (i < source.length && /[^\s/>]/.test(source[i]!)) i++;
    return source.slice(start, i);
}

function parseAttrValue(source: string, i: number): { value: string; next: number } {
    const quote = source[i];
    if (quote !== '"' && quote !== "'") {
        throw new XmlParseError(`属性值缺少引号`, i);
    }
    i++;
    const start = i;
    while (i < source.length && source[i] !== quote) {
        // 实体解码延后，这里只取原始串
        i++;
    }
    if (i >= source.length) throw new XmlParseError(`属性值未闭合`, start);
    return { value: decodeEntities(source.slice(start, i)), next: i + 1 };
}

function parseAttrs(source: string, i: number): { attrs: Record<string, string>; next: number } {
    const attrs: Record<string, string> = {};
    for (; ;) {
        i = skipWhitespace(source, i);
        if (i >= source.length) throw new XmlParseError(`标签未闭合`, i);
        const ch = source[i];
        if (ch === "/" || ch === ">") return { attrs, next: i };
        const nameStart = i;
        while (i < source.length && /[^\s=/>]/.test(source[i]!)) i++;
        const name = source.slice(nameStart, i);
        i = skipWhitespace(source, i);
        if (source[i] !== "=") throw new XmlParseError(`属性 ${name} 缺少 "="`, i);
        i = skipWhitespace(source, i + 1);
        const { value, next } = parseAttrValue(source, i);
        attrs[name] = value;
        i = next;
    }
}

/** 解析单条元素（含子元素），返回元素与结束位置。 */
function parseElement(source: string, startIndex: number): { element: XmlElement; next: number } {
    if (source[startIndex] !== "<") throw new XmlParseError(`期望元素起始 "<"`, startIndex);

    // 跳过注释或声明
    if (source.startsWith("<!--", startIndex)) {
        const end = source.indexOf("-->", startIndex + 4);
        if (end < 0) throw new XmlParseError(`注释未闭合`, startIndex);
        return parseElement(source, end + 3);
    }
    if (source.startsWith("<?", startIndex)) {
        const end = source.indexOf("?>", startIndex + 2);
        if (end < 0) throw new XmlParseError(`声明/处理指令未闭合`, startIndex);
        return parseElement(source, end + 2);
    }
    if (source.startsWith("<!", startIndex)) {
        throw new XmlParseError(`不支持 DOCTYPE 等 <! 结构`, startIndex);
    }

    let i = startIndex + 1;
    const name = parseTagName(source, i);
    if (name.length === 0) throw new XmlParseError(`元素名为空`, startIndex + 1);
    i += name.length;

    const { attrs, next } = parseAttrs(source, i);
    i = next;

    if (source[i] === "/" && source[i + 1] === ">") {
        return { element: { name, attrs, children: [] }, next: i + 2 };
    }
    if (source[i] === ">") {
        i++;
    } else {
        throw new XmlParseError(`元素 ${name} 起始标记未闭合`, i);
    }

    const children: XmlElement[] = [];
    for (; ;) {
        const textStart = i;
        while (i < source.length && source[i] !== "<") i++;
        const text = source.slice(textStart, i);
        if (text.trim().length > 0) {
            // FGUI 源 XML 无文本节点；出现非空白文本则视为异常，避免静默丢内容
            throw new XmlParseError(`元素 ${name} 内出现意外文本内容`, textStart);
        }
        if (i >= source.length) throw new XmlParseError(`元素 ${name} 未闭合`, startIndex);

        if (source.startsWith("</", i)) {
            const closeStart = i + 2;
            const closeName = parseTagName(source, closeStart);
            const closeEnd = source.indexOf(">", closeStart);
            if (closeEnd < 0) throw new XmlParseError(`结束标签未闭合`, i);
            if (closeName !== name) {
                throw new XmlParseError(`结束标签 </${closeName}> 与起始 <${name}> 不匹配`, i);
            }
            return { element: { name, attrs, children }, next: closeEnd + 1 };
        }

        const { element, next: childNext } = parseElement(source, i);
        children.push(element);
        i = childNext;
    }
}

/** 跳过开头的空白、XML 声明与注释，返回首个真实元素起始位置。 */
function skipProlog(source: string, i: number): number {
    for (; ;) {
        i = skipWhitespace(source, i);
        if (source.startsWith("<!--", i)) {
            const end = source.indexOf("-->", i + 4);
            if (end < 0) throw new XmlParseError(`注释未闭合`, i);
            i = end + 3;
            continue;
        }
        if (source.startsWith("<?", i)) {
            const end = source.indexOf("?>", i + 2);
            if (end < 0) throw new XmlParseError(`声明/处理指令未闭合`, i);
            i = end + 2;
            continue;
        }
        return i;
    }
}

export function parseXml(source: string): XmlElement {
    const start = skipProlog(source, 0);
    const { element, next } = parseElement(source, start);
    const rest = source.slice(next).trim();
    if (rest.length > 0) {
        throw new XmlParseError(`根元素后有残留内容: ${rest.slice(0, 40)}`, next);
    }
    return element;
}

/** 按名称查找直接子元素（首个）。 */
export function findChild(element: XmlElement, name: string): XmlElement | undefined {
    return element.children.find((child) => child.name === name);
}
