/**
 * 测试翻译板块组件。
 *
 * 纯展示 + 触发：所有状态机逻辑（端口生命周期、超时、原文回滚）都收敛在
 * useTestTranslation hook 里，组件只负责渲染文本节点列表和操作按钮。
 */

import type { Component } from "solid-js";
import { For } from "solid-js";
import Button from "../../components/Button/Button";
import { useTestTranslation } from "../hooks/useTestTranslation";
import styles from "./TestPanel.module.css";

interface TestPanelProps {
	/** 取当前 API Base URL 的 getter，点击"开始翻译"时透传给 hook */
	getBaseUrl: () => string;
	/** 取当前模型名的 getter */
	getModel: () => string;
}

const TestPanel: Component<TestPanelProps> = (props) => {
	const {
		testSource,
		isTesting,
		updateTestLine,
		addTestLine,
		resetTestSource,
		start,
	} = useTestTranslation({
		getBaseUrl: props.getBaseUrl,
		getModel: props.getModel,
	});

	return (
		<div class={styles.testPanel}>
			<h3>测试翻译</h3>
			<ul class={styles.testNodeList}>
				<For each={testSource()}>
					{(line, i) => (
						<li>
							<input
								type="text"
								class={styles.textNodeInput}
								spellcheck={false}
								autocomplete="off"
								value={line}
								onInput={(e) => updateTestLine(i(), e.currentTarget.value)}
							/>
						</li>
					)}
				</For>
			</ul>
			<div class={styles.testActions}>
				<Button
					type="button"
					variant="secondary"
					size="medium"
					onClick={start}
					disabled={isTesting()}
				>
					{isTesting() ? "翻译中..." : "开始翻译"}
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="medium"
					onClick={addTestLine}
					disabled={isTesting()}
				>
					添加文本节点
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="medium"
					onClick={resetTestSource}
					disabled={isTesting()}
				>
					复原
				</Button>
			</div>
		</div>
	);
};

export default TestPanel;
