fn main() {
    if let Err(error) = aicraft_pty::client::run_cli() {
        eprintln!("error: {error:#}");
        std::process::exit(1);
    }
}
