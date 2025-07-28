/**
 * Ambient type declarations for third-party packages without @types
 * This file provides basic type definitions for packages that don't have
 * official TypeScript definitions available.
 */

// JSX namespace for React components
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface Element {
    type: any;
    props: any;
    key: any;
  }
}

// commander - CLI framework
declare module 'commander' {
  export interface Command {
    command(name: string): Command;
    alias(alias: string): Command;
    description(description: string): Command;
    option(flags: string, description?: string, defaultValue?: any): Command;
    action(fn: (...args: any[]) => void | Promise<void>): Command;
    argument(name: string, description?: string): Command;
    arguments(names: string[]): Command;
    parse(argv?: string[]): Command;
    help(): void;
    version(version: string, flags?: string): Command;
    usage(usage: string): Command;
    name(name: string): Command;
    program: Command;
  }

  export interface Option {
    flags: string;
    description?: string;
    defaultValue?: any;
    required?: boolean;
    optional?: boolean;
    variadic?: boolean;
    short?: string;
    long?: string;
    negate?: boolean;
  }

  export class Command {
    constructor(name?: string);

    command(name: string): Command;

    alias(alias: string): Command;

    description(description: string): Command;

    option(flags: string, description?: string, defaultValue?: any): Command;

    action(fn: (...args: any[]) => void | Promise<void>): Command;

    argument(name: string, description?: string): Command;

    arguments(names: string[]): Command;

    parse(argv?: string[]): Command;

    help(): void;

    version(version: string, flags?: string): Command;

    usage(usage: string): Command;

    name(name: string): Command;

    program: Command;

    opts(): Record<string, any>;

    args: any[];
  }

  export function program(): Command;
  export function command(name?: string): Command;
  export function option(flags: string, description?: string, defaultValue?: any): Command;
  export function action(fn: (...args: any[]) => void | Promise<void>): Command;
  export function argument(name: string, description?: string): Command;
  export function arguments(names: string[]): Command;
  export function parse(argv?: string[]): Command;
  export function help(): void;
  export function version(version: string, flags?: string): Command;
  export function usage(usage: string): Command;
  export function name(name: string): Command;
}

// blessed-contrib - Terminal UI library
declare module 'blessed-contrib' {
  import type { Widgets } from 'blessed';

  export interface GridOptions {
    rows: number;
    cols: number;
    screen?: Widgets.Screen;
    top?: string | number;
    left?: string | number;
    width?: string | number;
    height?: string | number;
  }

  export interface ChartOptions {
    style?: {
      line?: string;
      text?: string;
      baseline?: string;
    };
    xLabelPadding?: number;
    xPadding?: number;
    showLegend?: boolean;
    legend?: { width: number };
    wholeNumbersOnly?: boolean;
    label?: string;
  }

  export interface LineChartOptions extends ChartOptions {
    style?: {
      line?: string;
      text?: string;
      baseline?: string;
    };
  }

  export interface BarChartOptions extends ChartOptions {
    barWidth?: number;
    barSpacing?: number;
    xOffset?: number;
    maxHeight?: number;
  }

  export interface DonutChartOptions extends ChartOptions {
    radius?: number;
    arcWidth?: number;
    yPadding?: number;
    data?: Array<{ percent: number; label: string; color: string }>;
  }

  export interface GaugeOptions extends ChartOptions {
    percent?: number[];
    stroke?: string;
    fill?: string;
    label?: string;
  }

  export interface MapOptions extends ChartOptions {
    style?: {
      bg?: string;
      fg?: string;
    };
  }

  export interface TableOptions extends ChartOptions {
    keys?: boolean;
    fg?: string;
    selectedFg?: string;
    selectedBg?: string;
    interactive?: boolean;
    label?: string;
    width?: string | number;
    height?: string | number;
    border?: Widgets.Types.TBoxOptions['border'];
    columnSpacing?: number;
    columnWidth?: number[];
  }

  export interface Grid {
    set(
      row: number,
      col: number,
      rowSpan: number,
      colSpan: number,
      obj: Widgets.BlessedElement,
      opts?: any
    ): Widgets.BlessedElement;
    applyLayout(nodes: any): void;
  }

  export interface LineChart extends Widgets.BlessedElement {
    setData(
      data: Array<{ title: string; x: string[]; y: number[]; style?: { line: string } }>
    ): void;
  }

  export interface BarChart extends Widgets.BlessedElement {
    setData(
      data: Array<{ title: string; x: string[]; y: number[]; style?: { line: string } }>
    ): void;
  }

  export interface DonutChart extends Widgets.BlessedElement {
    setData(data: Array<{ percent: number; label: string; color: string }>): void;
  }

  export interface Gauge extends Widgets.BlessedElement {
    setPercent(percent: number): void;
  }

  export interface Map extends Widgets.BlessedElement {
    setData(data: Array<{ lat: number; lon: number; color: string }>): void;
  }

  export interface Table extends Widgets.BlessedElement {
    setData(data: Array<Array<string>>): void;
  }

  export interface Log extends Widgets.BlessedElement {
    log(message: string): void;
  }

  export interface Sparkline extends Widgets.BlessedElement {
    setData(data: string[], data2: number[]): void;
  }

  export function grid(options: GridOptions): Grid;
  export function line(options: LineChartOptions): LineChart;
  export function bar(options: BarChartOptions): BarChart;
  export function donut(options: DonutChartOptions): DonutChart;
  export function gauge(options: GaugeOptions): Gauge;
  export function map(options: MapOptions): Map;
  export function table(options: TableOptions): Table;
  export function log(options: ChartOptions): Log;
  export function sparkline(options: ChartOptions): Sparkline;
}

// cli-table3 - CLI table formatting
declare module 'cli-table3' {
  export interface TableOptions {
    chars?: {
      top?: string;
      'top-mid'?: string;
      'top-left'?: string;
      'top-right'?: string;
      bottom?: string;
      'bottom-mid'?: string;
      'bottom-left'?: string;
      'bottom-right'?: string;
      left?: string;
      'left-mid'?: string;
      mid?: string;
      'mid-mid'?: string;
      right?: string;
      'right-mid'?: string;
      middle?: string;
    };
    truncate?: string;
    colWidths?: number[];
    colAligns?: Array<'left' | 'middle' | 'right'>;
    head?: string[];
    wordWrap?: boolean;
    wrapOnWordBoundary?: boolean;
    style?: {
      'padding-left'?: number;
      'padding-right'?: number;
      head?: string[];
      border?: string[];
      compact?: boolean;
    };
  }

  export class Table {
    constructor(options?: TableOptions);

    push(...rows: Array<string | string[]>): this;

    toString(): string;

    length: number;
  }

  export default Table;
}

// enquirer - CLI prompts
declare module 'enquirer' {
  export interface PromptOptions {
    name?: string;
    message?: string;
    initial?: any;
    required?: boolean;
    validate?: (value: any) => boolean | string | Promise<boolean | string>;
    format?: (value: any) => any;
    result?: (value: any) => any;
    skip?: boolean | ((state: any) => boolean);
    limit?: number;
    delay?: number;
    show?: boolean;
    styles?: any;
    symbols?: any;
    indicator?: string;
    separator?: string;
    prefix?: string;
    suffix?: string;
    header?: string;
    footer?: string;
    hint?: string;
    warn?: string;
    error?: string;
    cancel?: string;
    submit?: string;
    choices?: Array<{
      name: string;
      value: any;
      hint?: string;
      disabled?: boolean;
    }>;
  }

  export interface TextPromptOptions extends PromptOptions {
    multiline?: boolean;
    placeholder?: string;
  }

  export interface SelectPromptOptions extends PromptOptions {
    multiple?: boolean;
    maxChoices?: number;
    sort?: boolean;
    linebreak?: boolean;
    scroll?: boolean;
  }

  export interface MultiSelectPromptOptions extends SelectPromptOptions {
    limit?: number;
    hint?: string;
    warn?: string;
  }

  export interface ConfirmPromptOptions extends PromptOptions {
    initial?: boolean;
  }

  export interface InputPromptOptions extends PromptOptions {
    multiline?: boolean;
    placeholder?: string;
  }

  export interface PasswordPromptOptions extends PromptOptions {
    mask?: string;
  }

  export interface NumberPromptOptions extends PromptOptions {
    float?: boolean;
    round?: number;
    increment?: number;
    min?: number;
    max?: number;
  }

  export interface ScalePromptOptions extends PromptOptions {
    scale?: Array<{ name: string; message: string; initial?: number }>;
    margin?: number[];
    format?: (value: any) => string;
  }

  export interface SnippetPromptOptions extends PromptOptions {
    fields?: Array<{
      name: string;
      message: string;
      initial?: any;
      validate?: (value: any) => boolean | string;
    }>;
    template?: string;
  }

  export interface SortPromptOptions extends PromptOptions {
    hint?: string;
    drag?: boolean;
    numbered?: boolean;
  }

  export interface TogglePromptOptions extends PromptOptions {
    enabled?: string;
    disabled?: string;
  }

  export class Prompt {
    constructor(options?: PromptOptions);

    run(): Promise<any>;

    on(event: string, listener: (...args: any[]) => void): this;

    off(event: string, listener: (...args: any[]) => void): this;
  }

  export class TextPrompt extends Prompt {
    constructor(options?: TextPromptOptions);
  }

  export class SelectPrompt extends Prompt {
    constructor(options?: SelectPromptOptions);
  }

  export class MultiSelectPrompt extends Prompt {
    constructor(options?: MultiSelectPromptOptions);
  }

  export class ConfirmPrompt extends Prompt {
    constructor(options?: ConfirmPromptOptions);
  }

  export class InputPrompt extends Prompt {
    constructor(options?: InputPromptOptions);
  }

  export class PasswordPrompt extends Prompt {
    constructor(options?: PasswordPromptOptions);
  }

  export class NumberPrompt extends Prompt {
    constructor(options?: NumberPromptOptions);
  }

  export class ScalePrompt extends Prompt {
    constructor(options?: ScalePromptOptions);
  }

  export class SnippetPrompt extends Prompt {
    constructor(options?: SnippetPromptOptions);
  }

  export class SortPrompt extends Prompt {
    constructor(options?: SortPromptOptions);
  }

  export class TogglePrompt extends Prompt {
    constructor(options?: TogglePromptOptions);
  }

  export function prompt(options: PromptOptions | PromptOptions[]): Promise<any>;
  export function autoComplete(options: any): Promise<any>;
  export function confirm(options: ConfirmPromptOptions): Promise<boolean>;
  export function input(options: InputPromptOptions): Promise<string>;
  export function invisible(options: PasswordPromptOptions): Promise<string>;
  export function list(options: SelectPromptOptions): Promise<any>;
  export function multiselect(options: MultiSelectPromptOptions): Promise<any[]>;
  export function numeral(options: NumberPromptOptions): Promise<number>;
  export function password(options: PasswordPromptOptions): Promise<string>;
  export function scale(options: ScalePromptOptions): Promise<any>;
  export function select(options: SelectPromptOptions): Promise<any>;
  export function snippet(options: SnippetPromptOptions): Promise<any>;
  export function sort(options: SortPromptOptions): Promise<any[]>;
  export function survey(options: any): Promise<any>;
  export function text(options: TextPromptOptions): Promise<string>;
  export function toggle(options: TogglePromptOptions): Promise<boolean>;
}

// ink - React for CLI
declare module 'ink' {
  import type { ReactNode } from 'react';
  import { Component } from 'react';

  export interface BoxProps {
    margin?: number | { top?: number; bottom?: number; left?: number; right?: number };
    marginX?: number;
    marginY?: number;
    padding?: number | { top?: number; bottom?: number; left?: number; right?: number };
    paddingX?: number;
    paddingY?: number;
    borderStyle?:
      | 'single'
      | 'double'
      | 'round'
      | 'bold'
      | 'singleDouble'
      | 'doubleSingle'
      | 'classic';
    borderColor?: string;
    borderDimColor?: string;
    borderBackgroundColor?: string;
    borderDirection?: 'horizontal' | 'vertical' | 'left' | 'right' | 'top' | 'bottom';
    children?: ReactNode;
  }

  export interface TextProps {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    dimColor?: boolean;
    color?: string;
    backgroundColor?: string;
    children?: ReactNode;
  }

  export interface NewlineProps {
    count?: number;
  }

  export interface SpacerProps {
    direction?: 'horizontal' | 'vertical';
  }

  export interface StaticProps {
    items?: ReactNode[];
    placeholder?: ReactNode;
  }

  export interface TransformProps {
    transform: (output: string) => string;
    children?: ReactNode;
  }

  export interface UseInputOptions {
    isActive?: boolean;
  }

  export interface UseAppOptions {
    exitOnCtrlC?: boolean;
  }

  export interface AppProps extends UseAppOptions {
    children?: ReactNode;
  }

  export class Box extends Component<BoxProps> {}
  export class Text extends Component<TextProps> {}
  export class Newline extends Component<NewlineProps> {}
  export class Spacer extends Component<SpacerProps> {}
  export class Static extends Component<StaticProps> {}
  export class Transform extends Component<TransformProps> {}
  export class App extends Component<AppProps> {}

  export function render(
    element: ReactNode,
    options?: { stdout?: NodeJS.WriteStream; stdin?: NodeJS.ReadStream }
  ): {
    waitUntilExit(): Promise<void>;
    unmount(): void;
    rerender(element: ReactNode): void;
  };

  export function useInput(
    inputHandler: (
      input: string,
      key: { name: string; ctrl: boolean; meta: boolean; shift: boolean }
    ) => void,
    options?: UseInputOptions
  ): void;
  export function useApp(): { exit: (error?: Error) => void };
  export function measureElement(element: ReactNode): { width: number; height: number };
  export function renderToString(element: ReactNode): string;
  export function createElement(type: any, props?: any, ...children: any[]): any;

  export default App;
}

// ink-testing-library - Testing utilities for Ink
declare module 'ink-testing-library' {
  import type { ReactElement } from 'react';

  export interface RenderOptions {
    stdout?: NodeJS.WriteStream;
    stdin?: NodeJS.ReadStream;
    debug?: boolean;
  }

  export interface RenderResult {
    lastFrame(): string;
    frames(): string[];
    unmount(): void;
    waitUntilExit(): Promise<void>;
    stdin: {
      write(data: string): void;
    };
    stdout: {
      write(data: string): void;
    };
  }

  export function render(element: ReactElement, options?: RenderOptions): RenderResult;
  export function cleanup(): void;
  export function waitFor(
    condition: () => boolean,
    options?: { timeout?: number; interval?: number }
  ): Promise<void>;
  export function waitForElementToBeRemoved(
    condition: () => boolean,
    options?: { timeout?: number; interval?: number }
  ): Promise<void>;
}

// listr2 - Task list runner
declare module 'listr2' {
  export interface TaskOptions {
    title?: string;
    task?: (ctx: any, task: Task) => void | Promise<void>;
    skip?: boolean | ((ctx: any) => boolean | string);
    enabled?: boolean | ((ctx: any) => boolean);
    exitOnError?: boolean;
    retry?: number | { tries: number; delay?: number };
    rollback?: (ctx: any, task: Task) => void | Promise<void>;
    renderer?: 'default' | 'verbose' | 'silent' | 'test' | 'simple';
    rendererOptions?: any;
  }

  export interface ListrOptions {
    concurrent?: boolean | number;
    exitOnError?: boolean;
    renderer?: 'default' | 'verbose' | 'silent' | 'test' | 'simple';
    rendererOptions?: any;
    nonTty?: boolean;
    registerSignalListeners?: boolean;
    ctx?: any;
    silentRendererCondition?: (output: any) => boolean;
  }

  export class Task {
    constructor(options: TaskOptions);

    title: string;

    output: string;

    isEnabled(): boolean;

    isSkipped(): boolean;

    isCompleted(): boolean;

    isPending(): boolean;

    isFailed(): boolean;

    isRetrying(): boolean;

    hasFailed(): boolean;

    hasTitle(): boolean;

    hasSubtasks(): boolean;

    isPrompt(): boolean;

    isPaused(): boolean;

    isSettled(): boolean;

    isPending(): boolean;

    isCompleted(): boolean;

    isFailed(): boolean;

    isSkipped(): boolean;

    isEnabled(): boolean;

    isRetrying(): boolean;

    hasFailed(): boolean;

    hasTitle(): boolean;

    hasSubtasks(): boolean;

    isPrompt(): boolean;

    isPaused(): boolean;

    isSettled(): boolean;

    run(ctx?: any): Promise<void>;
  }

  export class Listr {
    constructor(tasks: TaskOptions[], options?: ListrOptions);

    add(tasks: TaskOptions | TaskOptions[]): this;

    run(ctx?: any): Promise<any>;

    newListr(tasks: TaskOptions[], options?: ListrOptions): Listr;
  }

  export default Listr;
}
