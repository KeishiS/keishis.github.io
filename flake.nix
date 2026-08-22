{
  description = "CV environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          pnpm
          nodejs_24
          bubblewrap

          typst
          typstyle
          typst-live
        ];
        shellHook = ''
          export SHELL="${pkgs.zsh}"/bin/zsh
          exec ${pkgs.zsh}/bin/zsh
        '';
      };
    };
}
