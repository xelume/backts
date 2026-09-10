let called = false;
function Get(value: () => string): void { called = true; }
class Controller {
  @Get
  get(): string { return 'ok'; }
}
const controller = new Controller();
if (controller.get() !== 'ok' || !called) throw new Error('Decorator not applied');
console.log('PASS method decorator');
