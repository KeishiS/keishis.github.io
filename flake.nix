{
  description = "CV environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpkgs-unstable.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-unstable,
    }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      pkgs-unstable = nixpkgs-unstable.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages =
          with pkgs;
          [
            pnpm
            nodejs_24
            bubblewrap

            typst
            typstyle
            typst-live
          ]
          ++ [
            pkgs-unstable.claude-code
          ];
        shellHook = ''
          export SHELL="${pkgs.zsh}"/bin/zsh
          exec ${pkgs.zsh}/bin/zsh
        '';
      };
    };
}
