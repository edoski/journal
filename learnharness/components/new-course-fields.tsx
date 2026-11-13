"use client";

import { useRef, useState } from "react";
import { CalendarIcon, FileTextIcon, FolderIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayDate, isoDay, longDay, pickWords, type MaterialPick } from "@/components/new-course-facts";
import { cn } from "@/lib/utils";

/** The exam day: shadcn's date picker, a button that opens a calendar.
 *  Days before today cannot be picked; Clear takes the day back. */
export function ExamDayField({ value, onChange, disabled }: { value: string | null; onChange: (day: string | null) => void; disabled?: boolean }) {
	const [open, setOpen] = useState(false);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return (
		<div className="flex items-center gap-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						disabled={disabled}
						data-testid="new-course-exam"
						className={cn("flex-1 justify-start font-normal", !value && "text-muted-foreground")}
					>
						<CalendarIcon aria-hidden />
						{value ? longDay(value) : "Not set yet"}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-0" data-testid="new-course-exam-calendar">
					<Calendar
						mode="single"
						selected={value ? dayDate(value) : undefined}
						defaultMonth={value ? dayDate(value) : today}
						disabled={{ before: today }}
						weekStartsOn={1}
						onSelect={(date) => {
							onChange(date ? isoDay(date) : null);
							setOpen(false);
						}}
					/>
				</PopoverContent>
			</Popover>
			{value && (
				<Button type="button" variant="quiet" size="icon-row" aria-label="Clear the exam day" disabled={disabled} onClick={() => onChange(null)}>
					<XIcon aria-hidden />
				</Button>
			)}
		</div>
	);
}

/** The course's material: Add files or Add a folder, each press one line
 *  that a cross takes back. */
export function MaterialField({ picks, onChange, disabled }: { picks: readonly MaterialPick[]; onChange: (picks: MaterialPick[]) => void; disabled?: boolean }) {
	const files = useRef<HTMLInputElement>(null);
	const folder = useRef<HTMLInputElement>(null);
	const add = (kind: MaterialPick["kind"], list: FileList | null) => {
		const chosen = Array.from(list ?? []).filter((f) => !f.name.startsWith("."));
		if (chosen.length > 0) onChange([...picks, { kind, files: chosen }]);
	};
	return (
		<div className="flex flex-col gap-2" data-testid="new-course-material">
			{picks.length > 0 && (
				<ul className="flex flex-col">
					{picks.map((pick, index) => {
						const Icon = pick.kind === "folder" ? FolderIcon : FileTextIcon;
						return (
							<li key={index} data-testid="new-course-material-pick" className="flex h-8 min-w-0 items-center gap-2 text-row font-normal text-foreground">
								<Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate">{pickWords(pick)}</span>
								<Button
									type="button"
									variant="quiet"
									size="icon-inline"
									aria-label={`Remove ${pickWords(pick)}`}
									disabled={disabled}
									onClick={() => onChange(picks.filter((_, i) => i !== index))}
								>
									<XIcon aria-hidden />
								</Button>
							</li>
						);
					})}
				</ul>
			)}
			<div className="flex gap-2">
				<Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => files.current?.click()} data-testid="new-course-add-files">
					<FileTextIcon aria-hidden />
					Add files
				</Button>
				<Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => folder.current?.click()} data-testid="new-course-add-folder">
					<FolderIcon aria-hidden />
					Add a folder
				</Button>
			</div>
			<input
				ref={files}
				type="file"
				multiple
				hidden
				data-testid="new-course-files-input"
				onChange={(e) => {
					add("files", e.target.files);
					e.target.value = "";
				}}
			/>
			<input
				ref={folder}
				type="file"
				hidden
				{...{ webkitdirectory: "" }}
				data-testid="new-course-folder-input"
				onChange={(e) => {
					add("folder", e.target.files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}
