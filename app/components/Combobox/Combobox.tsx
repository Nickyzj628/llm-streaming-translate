import type { Component } from "solid-js";
import {
	createMemo,
	createSignal,
	createUniqueId,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import styles from "./Combobox.module.css";

interface ComboboxProps {
	/** 当前值（受控，由父组件持有，如 model()） */
	value: string;
	/** 候选选项列表 */
	options: string[];
	placeholder?: string;
	/** 值变化回调（手动输入或点选选项都会触发） */
	onChange: (value: string) => void;
	/** 透传给根节点的自定义 class（如用于 flex 布局） */
	class?: string;
}

/**
 * 可输入可下拉的组合框：
 * - 点右侧箭头展开全部候选；聚焦输入框也自动展开
 * - 输入关键字实时过滤候选（大小写不敏感的子串匹配）
 * - 键盘 ↑/↓ 导航、Enter 选中、Escape 关闭
 * - 手动输入的值即使不在候选里也允许（适配没有 /models 接口的供应商）
 *
 * 为什么不用原生 <input list> + <datalist>：
 * datalist 的下拉是浏览器私有的、无统一外观，且无法用 JS 编程展开，
 * 不同浏览器（Chrome/Edge/Firefox）呼出方式不一致，体验不可控。
 */
const Combobox: Component<ComboboxProps> = (props) => {
	const [open, setOpen] = createSignal(false);
	const [activeIndex, setActiveIndex] = createSignal(-1);
	// 过滤关键字：与 value 解耦——点箭头/聚焦时清空它即可显示全部候选，
	// 否则已保存的模型名会按内容过滤掉大部分选项
	const [query, setQuery] = createSignal("");
	// 候选列表 id（每个实例唯一，供 aria-controls / aria-activedescendant 引用）
	const listboxId = createUniqueId();
	let wrapperRef: HTMLDivElement | undefined;

	// 过滤逻辑：query 为空时显示全部，否则大小写不敏感的子串匹配
	const filtered = createMemo(() => {
		const q = query().trim().toLowerCase();
		if (!q) return props.options;
		return props.options.filter((option) => option.toLowerCase().includes(q));
	});

	// 点击 wrapper 外部任意处时关闭列表（用 contains 判断，wrapper 内点击不关闭）
	const handleDocumentClick = (e: MouseEvent): void => {
		if (wrapperRef && !wrapperRef.contains(e.target as Node)) {
			setOpen(false);
		}
	};
	onMount(() => document.addEventListener("click", handleDocumentClick));
	onCleanup(() => document.removeEventListener("click", handleDocumentClick));

	// 展开列表：清空过滤关键字显示全部，重置键盘高亮
	const openList = (): void => {
		setQuery("");
		setActiveIndex(-1);
		setOpen(true);
	};

	// 选中某个候选：回传值并关闭列表
	const selectOption = (option: string): void => {
		setQuery(option);
		props.onChange(option);
		setOpen(false);
	};

	// 手动输入：实时回传值（允许不在候选里的自定义模型名），并打开列表过滤
	const handleInput = (e: Event): void => {
		const value = (e.currentTarget as HTMLInputElement).value;
		setQuery(value);
		props.onChange(value);
		setOpen(true);
		setActiveIndex(-1);
	};

	// 键盘导航：↑/↓ 移动高亮，Enter 选中高亮项（无高亮时选第一个），Escape 关闭
	const handleKeyDown = (e: KeyboardEvent): void => {
		const list = filtered();
		const count = Math.max(list.length, 1);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (!open()) openList();
			setActiveIndex((i) => (i + 1) % count);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (!open()) openList();
			setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1));
		} else if (e.key === "Enter") {
			const target = activeIndex() >= 0 ? list[activeIndex()] : list[0];
			if (open() && target) {
				e.preventDefault();
				selectOption(target);
			}
		} else if (e.key === "Escape") {
			setOpen(false);
		}
	};

	return (
		<div class={`${styles.wrapper} ${props.class || ""}`.trim()} ref={wrapperRef}>
			{/* 聚焦时全选已有文本并展开全部候选，方便直接覆盖输入 */}
			<input
				class={styles.input}
				type="text"
				role="combobox"
				aria-expanded={open()}
				aria-haspopup="listbox"
				aria-controls={listboxId}
				aria-autocomplete="list"
				aria-activedescendant={
					open() && activeIndex() >= 0
						? `${listboxId}-option-${activeIndex()}`
						: undefined
				}
				value={props.value}
				placeholder={props.placeholder}
				spellcheck={false}
				autocomplete="off"
				onInput={handleInput}
				onFocus={(e) => {
					e.currentTarget.select();
					openList();
				}}
				onKeyDown={handleKeyDown}
			/>
			<button
				type="button"
				class={styles.toggle}
				aria-label="展开模型列表"
				onClick={() => (open() ? setOpen(false) : openList())}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<title>展开模型列表</title>
					<path d="m6 9 6 6 6-6" />
				</svg>
			</button>
			<Show when={open()}>
				<div class={styles.list} role="listbox" id={listboxId}>
					<Show when={filtered().length === 0}>
						<div class={styles.empty}>无匹配项</div>
					</Show>
					<For each={filtered()}>
						{(option, index) => (
							<div
								id={`${listboxId}-option-${index()}`}
								class={`${styles.option} ${
									index() === activeIndex() ? styles.active : ""
								}`.trim()}
								role="option"
								aria-selected={index() === activeIndex()}
								// 阻止 mousedown 抢焦点，避免 input 失焦导致体验割裂
								tabIndex={-1}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => selectOption(option)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										selectOption(option);
									}
								}}
							>
								{option}
							</div>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
};

export default Combobox;
