import { Command } from 'commander';

export function registerSearchCommands(program: Command): void {
  const searchCmd = program
    .command('search')
    .alias('s')
    .description('Search tasks and content');

  // TODO: Implement search commands
  searchCmd
    .command('tasks <query>')
    .description('Search tasks')
    .action((query: string) => {
      console.log(`Search tasks "${query}" - TODO: Implement`);
    });

  searchCmd
    .command('all <query>')
    .description('Search all content')
    .action((query: string) => {
      console.log(`Search all "${query}" - TODO: Implement`);
    });
}