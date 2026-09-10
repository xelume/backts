let called = false;
function Module(value: typeof AppModule): void { called = true; }
@Module
class AppModule {
  get(): string { return 'ok'; }
}
const app = new AppModule();
if (app.get() !== 'ok' || !called) throw new Error('Decorator not applied');
console.log('PASS class decorator');
