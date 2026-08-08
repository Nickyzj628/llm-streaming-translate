/**
 * 备份与恢复板块组件。
 *
 * 导出 / 导入的纯逻辑（序列化下载、JSON 解析、类型守卫）在
 * utils/importExport.ts，组件只负责用户交互和 toast 提示。
 * 导入成功后通过 onImport 回调把配置回填到 App 层的表单 store。
 */
import type { Component } from "solid-js";
import Button from "../../components/Button/Button";
import { useToast } from "../../hooks/useToast";
import type { ImportableConfig } from "../utils/importExport";
import { exportConfig, importConfig } from "../utils/importExport";
import styles from "./ImportExportPanel.module.css";

interface ImportExportPanelProps {
	/** 导入成功后的回填回调（把配置写回表单 store） */
	onImport: (config: ImportableConfig) => void;
}

const ImportExportPanel: Component<ImportExportPanelProps> = (props) => {
	const { showToast } = useToast();
	let fileInputRef: HTMLInputElement | undefined;

	const handleExport = async (): Promise<void> => {
		await exportConfig();
		showToast("配置已导出，文件包含 API Key，请妥善保存勿分享", "success");
	};

	const handleImportClick = (): void => {
		fileInputRef?.click();
	};

	const handleFileChange = async (e: Event): Promise<void> => {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const config = await importConfig(file);
		if (config) {
			// 导入成功后回填表单；不自动拉取模型列表，由用户点"刷新"手动触发
			props.onImport(config);
			showToast("设置已保存", "success");
		} else {
			alert("配置文件无效：缺少必要字段或不是合法 JSON");
		}

		if (fileInputRef) {
			// 清空 input 的 value，确保下次选择同一文件也能触发 change
			fileInputRef.value = "";
		}
	};

	return (
		<div class={styles.importExport}>
			<h3>备份与恢复</h3>
			<div class={styles.importExportActions}>
				<Button
					type="button"
					variant="secondary"
					size="medium"
					onClick={handleExport}
				>
					导出配置
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="medium"
					onClick={handleImportClick}
				>
					导入配置
				</Button>
				<input
					ref={(el) => {
						fileInputRef = el;
					}}
					type="file"
					accept="application/json"
					onChange={handleFileChange}
					class={styles.hiddenInput}
				/>
			</div>
		</div>
	);
};

export default ImportExportPanel;
